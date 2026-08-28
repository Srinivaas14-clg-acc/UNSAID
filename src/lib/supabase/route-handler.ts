import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Separate @supabase/ssr server client for verifying organiser identity
 * (Supabase Auth / auth.users) inside route handlers, via `.auth.getUser()`
 * ONLY. Never touches application tables directly — all table reads/writes
 * continue to go through the existing service-role client in
 * src/lib/supabase/server.ts, unchanged.
 *
 * Used only by POST /api/sessions and GET /api/sessions, per the decided
 * architecture: Supabase Auth governs login + the session-list route only.
 * The other 10 session-scoped routes are untouched and keep validating
 * X-Organiser-Token / X-Anon-Token exactly as before.
 *
 * Route Handlers in Next.js App Router can read request cookies but cannot
 * always write response cookies depending on context; we pass through a
 * mutable NextResponse so a token refresh (if one occurs mid-request) has
 * somewhere to write updated cookies. If the route only reads auth state and
 * returns a fresh NextResponse.json(...), the caller should not expect these
 * cookie writes to survive — that mirrors Supabase's documented caveat that
 * route handlers may need the response object passed in.
 */
export function getSupabaseRouteHandlerClient(req: NextRequest, res: NextResponse) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set these in .env.local."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
}
