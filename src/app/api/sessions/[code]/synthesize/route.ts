import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSessionByCode, validateOrganiserToken } from "@/lib/api/auth";
import { extractClaims } from "@/lib/gemini/extractor";
import { suggestClusters } from "@/lib/aggregate/cluster";
import { aggregate } from "@/lib/aggregate/aggregator";
import { generateRecommendation } from "@/lib/gemini/recommend";
import type { Claim, ResponseRow, Session, Synthesis, SynthesizeResponse } from "@/lib/types";

const MIN_PARTICIPANTS = 2;

// Reverts the atomic-claim state flip (see Step 3.5) back to its pre-claim
// value if the pipeline fails after claiming the run but before a synthesis
// row exists. Best-effort: if this update itself fails, the session is left
// in "revealed" with no synthesis — a stuck state an organiser can retry out
// of once the underlying transient error clears, rather than a data-integrity
// problem (no partial/incorrect synthesis is ever persisted).
async function revertClaim(
  supabase: SupabaseClient,
  sessionId: string,
  previousState: Session["state"]
) {
  await supabase.from("sessions").update({ state: previousState }).eq("id", sessionId);
}

// POST /api/sessions/[code]/synthesize
// Orchestrates extract -> null-out transcripts -> fetch real claim_ids ->
// aggregate -> persist syntheses. Idempotent. Organiser-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const organiserToken = req.headers.get("X-Organiser-Token");

  // Hoisted so the outer catch (e.g. a thrown error from a Gemini call, not
  // just an explicit error-return) can also revert an in-progress claim —
  // otherwise an exception between the Step 3.5 claim and a successful
  // synthesis insert would leave the session stuck in "revealed".
  let claimedSessionId: string | null = null;
  let claimedPreviousState: Session["state"] | null = null;

  try {
    const supabase = getSupabaseServerClient();

    const session = await loadSessionByCode(supabase, code);
    if (!session) return apiError("not_found", "No session with that code.");

    const typedSession = session as Session;

    if (!validateOrganiserToken(typedSession, organiserToken)) {
      return apiError("unauthorized", "Invalid or missing X-Organiser-Token.");
    }

    // Step 2: idempotency check — a cached syntheses row is returned as-is,
    // never re-running extraction.
    const { data: existingSynthesis, error: existingError } = await supabase
      .from("syntheses")
      .select("*")
      .eq("session_id", typedSession.id)
      .maybeSingle();

    if (existingError) {
      return apiError("internal_error", `Failed to check existing synthesis: ${existingError.message}`);
    }

    if (existingSynthesis) {
      const response: SynthesizeResponse = { status: "ok", synthesis: existingSynthesis as Synthesis };
      return NextResponse.json(response, { status: 200 });
    }

    // Step 3: count submitted participants. Do not call Gemini at all on
    // the insufficient-data path.
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("id, submitted_at")
      .eq("session_id", typedSession.id);

    if (participantsError) {
      return apiError("internal_error", `Failed to load participants: ${participantsError.message}`);
    }

    const submittedParticipants = (participants ?? []).filter((p) => p.submitted_at !== null);

    if (submittedParticipants.length < MIN_PARTICIPANTS) {
      const response: SynthesizeResponse = {
        status: "insufficient_data",
        participants_submitted: submittedParticipants.length,
        minimum_required: MIN_PARTICIPANTS,
      };
      return NextResponse.json(response, { status: 200 });
    }

    const submittedParticipantIds = submittedParticipants.map((p) => p.id);

    // Step 3.5: atomically claim the right to run the pipeline. A concurrent
    // double-click (or retry) races here: only the request whose UPDATE
    // actually flips a row from open/closed -> revealed may proceed past
    // this point. The loser sees zero rows affected and falls through to a
    // short poll for the winner's synthesis instead of re-running extraction
    // — this is what makes /synthesize genuinely idempotent under
    // concurrency, not just idempotent once a row already exists.
    const { data: claimedSessions, error: claimError } = await supabase
      .from("sessions")
      .update({ state: "revealed" })
      .eq("id", typedSession.id)
      .in("state", ["open", "closed"])
      .select("id");

    if (claimError) {
      return apiError("internal_error", `Failed to claim synthesis run: ${claimError.message}`);
    }

    if (!claimedSessions || claimedSessions.length === 0) {
      // Someone else's request won the race (or the session was already
      // revealed by a prior successful run before this request's own
      // idempotency check above observed it). Poll briefly for the
      // synthesis row that winner is about to insert, rather than error.
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data: raceSynthesis } = await supabase
          .from("syntheses")
          .select("*")
          .eq("session_id", typedSession.id)
          .maybeSingle();
        if (raceSynthesis) {
          const response: SynthesizeResponse = { status: "ok", synthesis: raceSynthesis as Synthesis };
          return NextResponse.json(response, { status: 200 });
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return apiError(
        "internal_error",
        "Another synthesis run is in progress and did not complete in time. Try again shortly."
      );
    }

    // From here on, the run has been claimed (sessions.state === 'revealed'
    // ahead of a synthesis row existing). Any early return must revert state
    // back to typedSession.state (its pre-claim value) first, so a failed
    // run doesn't strand the session in "revealed" with nothing to show.
    const preClaimState = typedSession.state;
    claimedSessionId = typedSession.id;
    claimedPreviousState = preClaimState;

    // Step 4: fetch only non-ignored responses for submitted participants —
    // rule 3 enforced as a query predicate, not a downstream filter.
    const { data: responseRows, error: responseRowsError } = await supabase
      .from("responses")
      .select("*")
      .in("participant_id", submittedParticipantIds)
      .not("consent", "is", null)
      .neq("consent", "ignore");

    if (responseRowsError) {
      await revertClaim(supabase, typedSession.id, preClaimState);
      return apiError("internal_error", `Failed to load responses: ${responseRowsError.message}`);
    }

    const usableResponses = (responseRows ?? []) as ResponseRow[];

    // Group by participant for isolated, parallel extraction calls.
    const byParticipant = new Map<string, ResponseRow[]>();
    for (const r of usableResponses) {
      const arr = byParticipant.get(r.participant_id) ?? [];
      arr.push(r);
      byParticipant.set(r.participant_id, arr);
    }

    // Step 5: one call per participant, in parallel, in isolation. A
    // participant whose call fails validation is dropped from this run.
    const extractionResults = await Promise.all(
      Array.from(byParticipant.entries()).map(async ([participantId, rows]) => {
        const turns = rows
          .filter((r) => r.transcript !== null)
          .map((r) => ({ probe: r.probe, transcript: r.transcript as string }));

        const claims = await extractClaims(participantId, turns);
        return { participantId, rows, claims };
      })
    );

    const successfulParticipants = extractionResults.filter(
      (r): r is { participantId: string; rows: ResponseRow[]; claims: NonNullable<typeof r.claims> } =>
        r.claims !== null
    );

    if (successfulParticipants.length < MIN_PARTICIPANTS) {
      // Not enough participants produced valid extracted claims after
      // failures — the insufficient_data response is more useful to the
      // organiser than a 502. This happens after the Step 3.5 claim, so
      // revert it: an insufficient-data outcome must not leave the session
      // stuck in "revealed" with no synthesis, and must remain retryable
      // once more participants submit or extraction succeeds.
      await revertClaim(supabase, typedSession.id, preClaimState);
      const response: SynthesizeResponse = {
        status: "insufficient_data",
        participants_submitted: submittedParticipants.length,
        minimum_required: MIN_PARTICIPANTS,
      };
      return NextResponse.json(response, { status: 200 });
    }

    // Steps 6-7: insert claims and null out transcripts, per-participant, as
    // each participant's extraction completes.
    for (const { participantId, rows, claims } of successfulParticipants) {
      if (claims.length > 0) {
        const { error: insertClaimsError } = await supabase.from("claims").insert(
          claims.map((c, i) => ({
            session_id: typedSession.id,
            participant_id: participantId,
            // Namespace the model-chosen slug by participant + index so two
            // participants who independently get the same slug (e.g. both
            // "budget-constraint") can never collide into one claim_id.
            // Extraction runs in isolation per participant (rule intent),
            // so the model itself has no way to avoid this on its own — it
            // must be enforced here, in code, not left to the prompt.
            // Semantic grouping across participants stays the job of
            // clustering (cluster.ts / cluster-sync.ts), never raw claim_id
            // string equality.
            claim_id: `${participantId}:${c.claim_id}:${i}`,
            claim: c.claim,
            stance: c.stance,
            intensity: c.intensity,
            category: c.category,
            consent: c.consent,
          }))
        );

        if (insertClaimsError) {
          await revertClaim(supabase, typedSession.id, preClaimState);
          return apiError("internal_error", `Failed to persist claims: ${insertClaimsError.message}`);
        }
      }

      // Rule 5: null out transcripts for this participant's response rows
      // immediately after its claims are persisted.
      const responseIds = rows.map((r) => r.id);
      if (responseIds.length > 0) {
        const { error: nullOutError } = await supabase
          .from("responses")
          .update({ transcript: null })
          .in("id", responseIds);

        if (nullOutError) {
          await revertClaim(supabase, typedSession.id, preClaimState);
          return apiError("internal_error", `Failed to null out transcripts: ${nullOutError.message}`);
        }
      }
    }

    // Step 8: fetch realClaimIds fresh from the claims table — never trust
    // in-process extractor output for this guard.
    const { data: realClaimRows, error: realClaimError } = await supabase
      .from("claims")
      .select("claim_id")
      .eq("session_id", typedSession.id);

    if (realClaimError) {
      await revertClaim(supabase, typedSession.id, preClaimState);
      return apiError("internal_error", `Failed to fetch real claim ids: ${realClaimError.message}`);
    }

    const realClaimIds = new Set((realClaimRows ?? []).map((r) => r.claim_id as string));

    const { data: allClaimRows, error: allClaimsError } = await supabase
      .from("claims")
      .select("*")
      .eq("session_id", typedSession.id);

    if (allClaimsError) {
      await revertClaim(supabase, typedSession.id, preClaimState);
      return apiError("internal_error", `Failed to fetch claims: ${allClaimsError.message}`);
    }

    const allClaims = (allClaimRows ?? []) as Claim[];

    // Step 10: clustering suggestions (may call Gemini for grouping only).
    const clusterSuggestions = await suggestClusters(allClaims);

    // Step 9: pure aggregation — no network call inside aggregate().
    const aggregatorOutput = aggregate(
      { claims: allClaims, realClaimIds, minParticipants: MIN_PARTICIPANTS },
      clusterSuggestions
    );

    // Step 11: recommendation/reframe text, grounded only in the already
    // rule-filtered output.
    const recommendation = await generateRecommendation(typedSession.question, aggregatorOutput);

    // Step 12: insert syntheses row. sessions.state is already 'revealed'
    // from the Step 3.5 claim — this insert either completes the run the
    // claim promised, or (on failure) gets reverted below so a stuck
    // "revealed, no synthesis" state doesn't persist.
    //
    // Uniqueness note (syntheses.session_id is UNIQUE in the schema): the
    // Step 3.5 claim already prevents two requests from reaching this insert
    // concurrently for the same session, so this is not a second line of
    // defense against the race — it's just the natural DB constraint that
    // would also catch a bug in the claim logic, kept as-is deliberately.
    const { data: insertedSynthesis, error: insertSynthesisError } = await supabase
      .from("syntheses")
      .insert({
        session_id: typedSession.id,
        agreement: aggregatorOutput.agreement,
        disagreement: aggregatorOutput.disagreement,
        quiet_constraints_count: aggregatorOutput.quiet_constraints_count,
        recommendation: recommendation?.recommendation ?? null,
        reframe_question: recommendation?.reframe_question ?? null,
        no_disagreement_found: aggregatorOutput.no_disagreement_found,
      })
      .select("*")
      .single();

    if (insertSynthesisError || !insertedSynthesis) {
      await revertClaim(supabase, typedSession.id, preClaimState);
      return apiError(
        "internal_error",
        `Failed to persist synthesis: ${insertSynthesisError?.message ?? "unknown error"}`
      );
    }

    // Run completed successfully — nothing left to revert if an unrelated
    // error somehow occurred after this point (it wouldn't, since we return
    // immediately below, but clearing these is cheap and removes any doubt).
    claimedSessionId = null;
    claimedPreviousState = null;

    const response: SynthesizeResponse = { status: "ok", synthesis: insertedSynthesis as Synthesis };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (claimedSessionId && claimedPreviousState) {
      try {
        const supabase = getSupabaseServerClient();
        await revertClaim(supabase, claimedSessionId, claimedPreviousState);
      } catch {
        // Best-effort revert; if this itself fails (e.g. Supabase newly
        // unreachable), fall through to reporting the original error below
        // rather than masking it with a revert failure.
      }
    }
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase/Gemini is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
