import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { generateUniqueSessionCode } from "@/lib/session/code";
import { generateOrganiserToken } from "@/lib/session/token";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetMySessionsResponse,
  PublicSession,
  Session,
  SessionTemplate,
} from "@/lib/types";

const VALID_TEMPLATES: SessionTemplate[] = [
  "decision",
  "retro",
  "exit",
  "stay",
  "pulse",
  "debrief",
  "policy_reaction",
];

function toPublicSession(session: Session): PublicSession {
  const { organiser_token, ...rest } = session;
  void organiser_token;
  return rest;
}

// POST /api/sessions — create a session. Requires organiser login (Supabase
// Auth session cookie) — see docs/API-CONTRACT.md §0.1 and §1.
export async function POST(req: NextRequest) {
  // Auth check happens FIRST, before any request-body validation, so an
  // unauthenticated caller never gets feedback about payload shape.
  const authProbe = NextResponse.next();
  let userId: string;
  try {
    const routeSupabase = getSupabaseRouteHandlerClient(req, authProbe);
    const {
      data: { user },
    } = await routeSupabase.auth.getUser();

    if (!user) {
      return apiError("unauthorized", "Sign in with Google to create a session.");
    }
    userId = user.id;
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError(
        "not_configured",
        "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    return apiError("unauthorized", "Sign in with Google to create a session.");
  }

  let body: CreateSessionRequest;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON.");
  }

  const { question, template, deadline, expected_participants } = body ?? {};

  if (typeof question !== "string" || question.trim().length === 0 || question.length > 500) {
    return apiError("invalid_request", "question is required, 1..500 chars.");
  }

  if (typeof template !== "string" || !VALID_TEMPLATES.includes(template as SessionTemplate)) {
    return apiError("invalid_request", "template must be one of the 7 supported values.");
  }

  if (typeof deadline !== "string" || Number.isNaN(Date.parse(deadline))) {
    return apiError("invalid_request", "deadline must be a valid ISO 8601 date string.");
  }

  if (new Date(deadline).getTime() <= Date.now()) {
    return apiError("invalid_request", "deadline must be in the future.");
  }

  if (
    expected_participants !== undefined &&
    (typeof expected_participants !== "number" || expected_participants < 1)
  ) {
    return apiError("invalid_request", "expected_participants must be >= 1 if present.");
  }

  try {
    const supabase = getSupabaseServerClient();
    const code = await generateUniqueSessionCode();
    const organiserToken = generateOrganiserToken();

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        code,
        question: question.trim(),
        template,
        deadline,
        expected_participants: expected_participants ?? null,
        organiser_token: organiserToken,
        organiser_user_id: userId,
      })
      .select("*")
      .single();

    if (error || !data) {
      return apiError("internal_error", `Failed to create session: ${error?.message ?? "unknown error"}`);
    }

    const session = data as Session;
    const response: CreateSessionResponse = {
      code: session.code,
      organiser_token: session.organiser_token,
      session: toPublicSession(session),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}

// GET /api/sessions — list the signed-in organiser's own past sessions.
// Auth: Supabase Auth session cookie ONLY (no X-Organiser-Token header for
// this route). See docs/API-CONTRACT.md §0.1 and new §GET /api/sessions.
//
// Deliberately re-serves organiser_token per row — a scoped, approved
// exception to "never re-serve organiser_token" — so the sidebar can
// deep-link straight into a past session's admin actions.
export async function GET(req: NextRequest) {
  const authProbe = NextResponse.next();
  let userId: string;
  try {
    const routeSupabase = getSupabaseRouteHandlerClient(req, authProbe);
    const {
      data: { user },
    } = await routeSupabase.auth.getUser();

    if (!user) {
      return apiError("unauthorized", "Sign in with Google to view your sessions.");
    }
    userId = user.id;
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError(
        "not_configured",
        "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    return apiError("unauthorized", "Sign in with Google to view your sessions.");
  }

  try {
    // Existing service-role client, unchanged import — user.id from the
    // Supabase Auth cookie is used as a plain WHERE-clause filter here, never
    // as a client-side RLS policy (see 0002_organiser_auth.sql comments).
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("code, question, template, deadline, state, created_at, organiser_token")
      .eq("organiser_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return apiError("internal_error", `Failed to list sessions: ${error.message}`);
    }

    const response: GetMySessionsResponse = {
      sessions: (data ?? []) as GetMySessionsResponse["sessions"],
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
