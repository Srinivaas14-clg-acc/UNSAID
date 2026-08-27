import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { generateUniqueSessionCode } from "@/lib/session/code";
import { generateOrganiserToken } from "@/lib/session/token";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
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

// POST /api/sessions — create a session.
export async function POST(req: NextRequest) {
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
