import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadSessionByCode, validateAnonToken } from "@/lib/api/auth";
import { decideNextProbe } from "@/lib/gemini/moderator";
import { TEMPLATE_Q1_QUESTION } from "@/lib/probes/library";
import type {
  FixedFirstProbeId,
  NextProbeRequest,
  NextProbeResponse,
  ResponseRow,
  Session,
} from "@/lib/types";

// Q1 is fixed by template, never chosen by the model — its probe_id is the
// distinct FixedFirstProbeId ("probe_q1"), not a member of the six-entry
// adaptive ProbeId enum. NextProbeResponse's `probe_id: ProbeId` field is
// therefore widened here for the turn-1 case only, matching the contract's
// intent (see src/lib/types.ts's FixedFirstProbeId doc comment).
type NextProbeResponseWithQ1 =
  | NextProbeResponse
  | { done: false; turn_index: number; probe_id: FixedFirstProbeId; question: string };

const MAX_TURNS = 3;

// POST /api/sessions/[code]/probe — decide the next probe or signal completion.
// The 3-question hard cap is enforced HERE, in code, before any Gemini call.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: NextProbeRequest;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON.");
  }

  if (!body?.participant_id || typeof body.participant_id !== "string") {
    return apiError("invalid_request", "participant_id is required.");
  }

  const anonToken = req.headers.get("X-Anon-Token");

  try {
    const supabase = getSupabaseServerClient();

    const session = await loadSessionByCode(supabase, code);
    if (!session) return apiError("not_found", "No session with that code.");

    const typedSession = session as Session;

    const participant = await validateAnonToken(
      supabase,
      typedSession.id,
      body.participant_id,
      anonToken
    );
    if (!participant) return apiError("unauthorized", "Invalid or missing X-Anon-Token for this participant.");

    if (typedSession.state !== "open") {
      return apiError("session_closed", "This session is no longer open.");
    }

    const { data: existingResponses, error: responsesError } = await supabase
      .from("responses")
      .select("turn_index, probe, transcript")
      .eq("participant_id", body.participant_id)
      .order("turn_index", { ascending: true });

    if (responsesError) {
      return apiError("internal_error", `Failed to load responses: ${responsesError.message}`);
    }

    const rows = (existingResponses ?? []) as Pick<ResponseRow, "turn_index" | "probe" | "transcript">[];
    const count = rows.length;

    // Hard cap: if the count is already 3, never call Gemini for turn 4.
    if (count >= MAX_TURNS) {
      const response: NextProbeResponse = { done: true, reason: "max_turns_reached" };
      return NextResponse.json(response, { status: 200 });
    }

    if (count === 0) {
      // Q1 is always template-fixed, never chosen by the model.
      const question = TEMPLATE_Q1_QUESTION[typedSession.template] ?? TEMPLATE_Q1_QUESTION.decision;
      const response: NextProbeResponseWithQ1 = {
        done: false,
        turn_index: 1,
        probe_id: "probe_q1",
        question,
      };
      return NextResponse.json(response, { status: 200 });
    }

    // count is 1 or 2: call the moderator via function calling.
    const turnsSoFar = rows
      .filter((r) => r.transcript !== null)
      .map((r) => ({ probe: r.probe, transcript: r.transcript as string }));

    const decision = await decideNextProbe(typedSession.question, turnsSoFar);

    if (decision.probe_id === "end_early") {
      const response: NextProbeResponse = { done: true, reason: "end_early" };
      return NextResponse.json(response, { status: 200 });
    }

    const response: NextProbeResponse = {
      done: false,
      turn_index: count + 1,
      probe_id: decision.probe_id,
      question: decision.question ?? "",
    };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase/Gemini is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
