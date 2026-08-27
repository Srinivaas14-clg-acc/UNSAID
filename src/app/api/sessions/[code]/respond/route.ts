import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadSessionByCode, validateAnonToken } from "@/lib/api/auth";
import { transcribeAudio } from "@/lib/gemini/transcribe";
import type { Session, SubmitResponseRequest, SubmitResponseResponse } from "@/lib/types";

const MAX_TURNS = 3;

// POST /api/sessions/[code]/respond — submit one turn's answer.
// Rejects a 4th turn_index with 400 BEFORE touching Gemini — independent
// enforcement of the 3-question cap alongside /probe.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: SubmitResponseRequest;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON.");
  }

  if (!body?.participant_id || typeof body.participant_id !== "string") {
    return apiError("invalid_request", "participant_id is required.");
  }

  if (
    typeof body.turn_index !== "number" ||
    !Number.isInteger(body.turn_index) ||
    body.turn_index < 1 ||
    body.turn_index > MAX_TURNS
  ) {
    return apiError("invalid_request", "turn_index must be an integer 1..3.");
  }

  if (!body.probe_id || typeof body.probe_id !== "string") {
    return apiError("invalid_request", "probe_id is required.");
  }

  const hasText = typeof body.text === "string" && body.text.trim().length > 0;
  const hasAudio = typeof body.audio_base64 === "string" && body.audio_base64.length > 0;

  if (hasText === hasAudio) {
    // Neither or both present.
    return apiError("invalid_request", "Exactly one of text or audio_base64 is required.");
  }

  if (hasAudio && (!body.audio_mime_type || typeof body.audio_mime_type !== "string")) {
    return apiError("invalid_request", "audio_mime_type is required when audio_base64 is present.");
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

    const { count, error: countError } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", body.participant_id);

    if (countError) {
      return apiError("internal_error", `Failed to count responses: ${countError.message}`);
    }

    const currentCount = count ?? 0;

    // Reject a 4th turn_index (or any out-of-sequence turn_index) with 400
    // before touching Gemini.
    if (currentCount >= MAX_TURNS || body.turn_index !== currentCount + 1) {
      return apiError("invalid_request", "turn_index does not match the next expected turn, or the 3-turn cap has been reached.");
    }

    let transcript: string;

    if (hasAudio) {
      try {
        transcript = await transcribeAudio(body.audio_base64 as string, body.audio_mime_type as string);
      } catch (err) {
        if (isMissingEnvError(err)) {
          return apiError("not_configured", "Gemini is not configured for audio transcription.");
        }
        return apiError("upstream_unavailable", "Transcription failed. Please retry or type your answer.");
      }
    } else {
      transcript = (body.text as string).trim();
    }

    const { data: inserted, error: insertError } = await supabase
      .from("responses")
      .insert({
        session_id: typedSession.id,
        participant_id: body.participant_id,
        turn_index: body.turn_index,
        probe: body.probe_id,
        transcript,
        consent: null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return apiError("internal_error", `Failed to save response: ${insertError?.message ?? "unknown error"}`);
    }

    const response: SubmitResponseResponse = { response_id: inserted.id, transcript };
    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
