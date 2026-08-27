/**
 * Thin client-side fetch wrapper for the Unsaid API (docs/API-CONTRACT.md).
 *
 * Every route returns the shared error envelope `{ error: { code, message } }`
 * on non-2xx (src/lib/types.ts `ApiError`). This wrapper normalizes both
 * network failures and envelope errors into one `ApiResult<T>` so every page
 * can handle "not_configured" and other error codes with a calm inline
 * message instead of a crash, per the frontend-lead brief's hard requirement.
 */

import type { ApiError, ApiErrorCode } from "@/lib/types";

export interface ApiFailure {
  ok: false;
  code: ApiErrorCode | "network_error";
  message: string;
  status: number;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  status: number;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "object"
  );
}

async function request<T>(
  path: string,
  init: RequestInit
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return {
      ok: false,
      code: "network_error",
      message:
        "Couldn't reach the server. Check your connection and try again.",
      status: 0,
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (e.g. a raw 500 HTML page). Fall through to a generic error.
  }

  if (!res.ok) {
    if (isApiError(body)) {
      return {
        ok: false,
        code: body.error.code,
        message: body.error.message,
        status: res.status,
      };
    }
    return {
      ok: false,
      code: "internal_error",
      message: `Request failed (${res.status}).`,
      status: res.status,
    };
  }

  return { ok: true, data: body as T, status: res.status };
}

export function apiGet<T>(
  path: string,
  headers?: Record<string, string>
): Promise<ApiResult<T>> {
  return request<T>(path, { method: "GET", headers });
}

export function apiPost<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<ApiResult<T>> {
  return request<T>(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

/** True when the error is the "keys not set yet" case every page must handle gracefully. */
export function isNotConfigured(result: ApiResult<unknown>): boolean {
  return !result.ok && result.code === "not_configured";
}
