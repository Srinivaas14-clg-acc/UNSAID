import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadSessionByCode, validateAnonToken } from "@/lib/api/auth";
import type { Participant, ResponseRow, Session, SubmitParticipantRequest, SubmitParticipantResponse } from "@/lib/types";

// POST /api/sessions/[code]/submit — mark a participant done.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: SubmitParticipantRequest;
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

    const typedParticipant = participant as Participant;

    // Idempotent: duplicate submit returns the existing value, not an error.
    if (typedParticipant.submitted_at) {
      const response: SubmitParticipantResponse = {
        participant_id: typedParticipant.id,
        submitted_at: typedParticipant.submitted_at,
      };
      return NextResponse.json(response, { status: 200 });
    }

    const { data: responses, error: responsesError } = await supabase
      .from("responses")
      .select("id, consent")
      .eq("participant_id", body.participant_id);

    if (responsesError) {
      return apiError("internal_error", `Failed to load responses: ${responsesError.message}`);
    }

    const rows = (responses ?? []) as Pick<ResponseRow, "id" | "consent">[];

    // Consent step is mandatory before submit closes: reject if every
    // response still has consent === null.
    const anyConsented = rows.some((r) => r.consent !== null);
    if (rows.length > 0 && !anyConsented) {
      return apiError("invalid_request", "All responses must have a consent level set before submitting.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("participants")
      .update({ submitted_at: new Date().toISOString() })
      .eq("id", body.participant_id)
      .select("id, submitted_at")
      .single();

    if (updateError || !updated) {
      return apiError("internal_error", `Failed to submit: ${updateError?.message ?? "unknown error"}`);
    }

    const response: SubmitParticipantResponse = {
      participant_id: updated.id,
      submitted_at: updated.submitted_at,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
