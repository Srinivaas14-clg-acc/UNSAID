import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { generateAnonToken } from "@/lib/session/token";
import type { JoinSessionRequest, JoinSessionResponse, PublicSession, Session } from "@/lib/types";

function toPublicSession(session: Session): PublicSession {
  const { organiser_token, ...rest } = session;
  void organiser_token;
  return rest;
}

// POST /api/sessions/[code]/join — participant joins, mints anon_token.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: JoinSessionRequest = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON.");
  }

  if (
    body.display_label !== undefined &&
    (typeof body.display_label !== "string" || body.display_label.length > 40)
  ) {
    return apiError("invalid_request", "display_label must be a string of at most 40 chars.");
  }

  try {
    const supabase = getSupabaseServerClient();

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (sessionError) {
      return apiError("internal_error", `Failed to load session: ${sessionError.message}`);
    }

    if (!session) {
      return apiError("not_found", "No session with that code.");
    }

    const typedSession = session as Session;

    if (typedSession.state !== "open") {
      return apiError("session_closed", "This session is no longer accepting participants.");
    }

    const anonToken = generateAnonToken();

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        session_id: typedSession.id,
        anon_token: anonToken,
        display_label: body.display_label ?? null,
      })
      .select("id")
      .single();

    if (participantError || !participant) {
      return apiError(
        "internal_error",
        `Failed to join session: ${participantError?.message ?? "unknown error"}`
      );
    }

    const response: JoinSessionResponse = {
      participant_id: participant.id,
      anon_token: anonToken,
      session: toPublicSession(typedSession),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
