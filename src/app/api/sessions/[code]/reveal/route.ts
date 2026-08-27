import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadSessionByCode, validateAnyToken } from "@/lib/api/auth";
import type { RevealResponse, Session, Synthesis } from "@/lib/types";

/**
 * GET /api/sessions/[code]/reveal — serves the cached synthesis. This is the
 * route every "no de-anonymisation path" claim (MISSION §6 rule 7) rests on.
 *
 * Structurally safe by construction: the ONLY table this handler ever
 * selects from (beyond the token-validation lookups in loadSessionByCode /
 * validateAnyToken) is `syntheses`, and only by `session_id`. There is no
 * parameter, header, or role that can make this handler join to `responses`,
 * `claims`, or `participants` for anything beyond auth.
 */
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

    // The one and only data query in this handler beyond auth: syntheses by
    // session_id. Never responses, never claims, never participants.
    const { data: synthesis, error: synthesisError } = await supabase
      .from("syntheses")
      .select("*")
      .eq("session_id", typedSession.id)
      .maybeSingle();

    if (synthesisError) {
      return apiError("internal_error", `Failed to load synthesis: ${synthesisError.message}`);
    }

    if (!synthesis) {
      const response: RevealResponse = { status: "not_ready" };
      return NextResponse.json(response, { status: 200 });
    }

    const response: RevealResponse = { status: "ready", synthesis: synthesis as Synthesis };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
