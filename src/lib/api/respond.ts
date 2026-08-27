import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@/lib/types";

/**
 * Shared error-envelope + status-mapping helper for API routes, per
 * docs/API-CONTRACT.md §0 ("Error envelope" and "HTTP status mapping").
 * Every route handler should use this instead of constructing ad hoc error
 * JSON, so the envelope shape and status codes never drift from the
 * contract.
 */

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  session_closed: 409,
  max_turns_reached: 400,
  not_configured: 503,
  upstream_unavailable: 502,
  internal_error: 500,
};

export function apiError(code: ApiErrorCode, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS_BY_CODE[code] }
  );
}

/**
 * Wraps a lib call that may throw due to a missing env var (Supabase or
 * Gemini) so the route returns a clean `not_configured` (503) JSON error
 * instead of an unhandled 500 with a stack trace. Any other thrown error is
 * re-thrown for the caller's own try/catch to classify.
 */
export function isMissingEnvError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("Missing SUPABASE_URL") ||
    err.message.includes("Missing SUPABASE_SERVICE_ROLE_KEY") ||
    err.message.includes("Missing GEMINI_API_KEY") ||
    err.message === "not_configured"
  );
}
