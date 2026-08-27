import { NextRequest, NextResponse } from "next/server";
import { apiError, isMissingEnvError } from "@/lib/api/respond";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadSessionByCode, validateAnonToken } from "@/lib/api/auth";
import type { ConsentLevel, ResponseRow, Session, SubmitConsentRequest, SubmitConsentResponse } from "@/lib/types";

const VALID_CONSENT: ConsentLevel[] = ["share_freely", "use_dont_quote", "ignore"];

// POST /api/sessions/[code]/consent — tag one response's consent level.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  let body: SubmitConsentRequest;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_request", "Request body must be valid JSON.");
  }

  if (!body?.participant_id || typeof body.participant_id !== "string") {
    return apiError("invalid_request", "participant_id is required.");
  }
  if (!body?.response_id || typeof body.response_id !== "string") {
    return apiError("invalid_request", "response_id is required.");
  }
  if (!VALID_CONSENT.includes(body?.consent)) {
    return apiError("invalid_request", "consent must be one of share_freely, use_dont_quote, ignore.");
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

    const { data: responseRow, error: responseError } = await supabase
      .from("responses")
      .select("id, participant_id, consent")
      .eq("id", body.response_id)
      .maybeSingle();

    if (responseError) {
      return apiError("internal_error", `Failed to load response: ${responseError.message}`);
    }

    if (!responseRow) {
      return apiError("not_found", "No such response.");
    }

    const typedResponse = responseRow as Pick<ResponseRow, "id" | "participant_id" | "consent">;

    if (typedResponse.participant_id !== body.participant_id) {
      return apiError("forbidden", "This response belongs to a different participant.");
    }

    if (typedResponse.consent !== null) {
      return apiError("conflict", "Consent has already been set for this response.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("responses")
      .update({ consent: body.consent })
      .eq("id", body.response_id)
      .select("id, consent")
      .single();

    if (updateError || !updated) {
      return apiError("internal_error", `Failed to update consent: ${updateError?.message ?? "unknown error"}`);
    }

    const response: SubmitConsentResponse = {
      response_id: updated.id,
      consent: updated.consent as ConsentLevel,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    if (isMissingEnvError(err)) {
      return apiError("not_configured", "Supabase is not configured.");
    }
    return apiError("internal_error", err instanceof Error ? err.message : "Unknown error.");
  }
}
