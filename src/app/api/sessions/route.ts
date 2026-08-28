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

// getSupabaseRouteHandlerClient writes any refreshed Supabase Auth cookies
// (e.g. an access-token refresh mid-request) onto the response object it's
// given — here, `authProbe` — rather than onto whatever response this route
// actually returns. Without copying them across, a refreshed cookie is
// silently dropped and the client can see one spurious 401 on the next
// request before the root proxy.ts middleware catches up. Call this on
// every return path in this file so the real response carries them.
function withAuthCookies(response: NextResponse, authProbe: NextResponse) {
  authProbe.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
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
      return withAuthCookies(apiError("unauthorized", "Sign in with Google to create a session."), authProbe);
    }
    userId = user.id;
  } catch (err) {
    if (isMissingEnvError(err)) {
      return withAuthCookies(
        apiError(
          "not_configured",
          "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        ),
        authProbe
      );
    }
    return withAuthCookies(apiError("unauthorized", "Sign in with Google to create a session."), authProbe);
  }

  let body: CreateSessionRequest;
  try {
    body = await req.json();
  } catch {
    return withAuthCookies(apiError("invalid_request", "Request body must be valid JSON."), authProbe);
  }

  const { question, template, deadline, expected_participants } = body ?? {};

  if (typeof question !== "string" || question.trim().length === 0 || question.length > 500) {
    return withAuthCookies(apiError("invalid_request", "question is required, 1..500 chars."), authProbe);
  }

  if (typeof template !== "string" || !VALID_TEMPLATES.includes(template as SessionTemplate)) {
    return withAuthCookies(
      apiError("invalid_request", "template must be one of the 7 supported values."),
      authProbe
    );
  }

  if (typeof deadline !== "string" || Number.isNaN(Date.parse(deadline))) {
    return withAuthCookies(
      apiError("invalid_request", "deadline must be a valid ISO 8601 date string."),
      authProbe
    );
  }

  if (new Date(deadline).getTime() <= Date.now()) {
    return withAuthCookies(apiError("invalid_request", "deadline must be in the future."), authProbe);
  }

  if (
    expected_participants !== undefined &&
    (typeof expected_participants !== "number" || expected_participants < 1)
  ) {
    return withAuthCookies(
      apiError("invalid_request", "expected_participants must be >= 1 if present."),
      authProbe
    );
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
      return withAuthCookies(
        apiError("internal_error", `Failed to create session: ${error?.message ?? "unknown error"}`),
        authProbe
      );
    }

    const session = data as Session;
    const response: CreateSessionResponse = {
      code: session.code,
      organiser_token: session.organiser_token,
      session: toPublicSession(session),
    };

    return withAuthCookies(NextResponse.json(response, { status: 201 }), authProbe);
  } catch (err) {
    if (isMissingEnvError(err)) {
      return withAuthCookies(
        apiError("not_configured", "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."),
        authProbe
      );
    }
    return withAuthCookies(
      apiError("internal_error", err instanceof Error ? err.message : "Unknown error."),
      authProbe
    );
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
      return withAuthCookies(apiError("unauthorized", "Sign in with Google to view your sessions."), authProbe);
    }
    userId = user.id;
  } catch (err) {
    if (isMissingEnvError(err)) {
      return withAuthCookies(
        apiError(
          "not_configured",
          "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        ),
        authProbe
      );
    }
    return withAuthCookies(apiError("unauthorized", "Sign in with Google to view your sessions."), authProbe);
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
      return withAuthCookies(apiError("internal_error", `Failed to list sessions: ${error.message}`), authProbe);
    }

    const response: GetMySessionsResponse = {
      sessions: (data ?? []) as GetMySessionsResponse["sessions"],
    };

    return withAuthCookies(NextResponse.json(response, { status: 200 }), authProbe);
  } catch (err) {
    if (isMissingEnvError(err)) {
      return withAuthCookies(
        apiError("not_configured", "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."),
        authProbe
      );
    }
    return withAuthCookies(
      apiError("internal_error", err instanceof Error ? err.message : "Unknown error."),
      authProbe
    );
  }
}
