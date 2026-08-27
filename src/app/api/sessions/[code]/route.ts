import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { GetSessionResponse, PublicSession, Session } from "@/lib/types";

function toPublicSession(session: Session): PublicSession {
  const { organiser_token, ...rest } = session;
  void organiser_token;
  return rest;
}

// GET /api/sessions/[code] — public session metadata, no auth required.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) {
      return apiError("internal_error", `Failed to load session: ${error.message}`);
    }

    if (!data) {
      return apiError("not_found", "No session with that code.");
    }

    const response: GetSessionResponse = { session: toPublicSession(data as Session) };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
