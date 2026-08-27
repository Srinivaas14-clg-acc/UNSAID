import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadSessionByCode, validateAnyToken } from "@/lib/api/auth";
import { getSessionPresence } from "@/lib/realtime/presence";
import type { PresenceResponse, Session } from "@/lib/types";

// GET /api/sessions/[code]/presence — polling fallback for live presence.
// Same auth symmetry as reveal: no route requires the organiser specifically.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const anonToken = req.headers.get("X-Anon-Token");
  const organiserToken = req.headers.get("X-Organiser-Token");

  try {
    const supabase = getSupabaseServerClient();

    const session = await loadSessionByCode(supabase, code);
    if (!session) return apiError("not_found", "No session with that code.");

    const typedSession = session as Session;

    const authorized = await validateAnyToken(supabase, typedSession, anonToken, organiserToken);
    if (!authorized) {
      return apiError("unauthorized", "A valid X-Anon-Token or X-Organiser-Token for this session is required.");
    }

    const presence = await getSessionPresence(typedSession.id);

    const response: PresenceResponse = presence;
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
