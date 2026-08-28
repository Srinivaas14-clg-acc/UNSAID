import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

/**
 * OAuth code-exchange callback for organiser Google sign-in via Supabase
 * Auth. This is plumbing (redirects), not a JSON API route — see
 * docs/API-CONTRACT.md §0.1.
 *
 * Flow: GoogleSignInButton calls supabase.auth.signInWithOAuth({ provider:
 * "google", options: { redirectTo: `${origin}/api/auth/callback` } }), the
 * user completes consent at Google, Supabase Auth redirects back here with
 * `?code=...`, and this route exchanges that code for a session, setting the
 * Supabase Auth cookies via @supabase/ssr.
 *
 * Redirects to `/dashboard` — the organiser dashboard route built by
 * frontend-lead (src/app/(dashboard)/dashboard/page.tsx). Previously
 * redirected to `/`; updated once that route landed.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const redirectTarget = "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}${redirectTarget}`);
  }

  const res = NextResponse.redirect(`${origin}${redirectTarget}`);

  try {
    const supabase = getSupabaseRouteHandlerClient(req, res);
    await supabase.auth.exchangeCodeForSession(code);
  } catch {
    // Auth not configured or exchange failed — fail open to a plain redirect
    // rather than surfacing a stack trace; the user simply isn't signed in.
  }

  return res;
}
