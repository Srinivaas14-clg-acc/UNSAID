import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * @supabase/ssr middleware-client helper (Supabase's standard pattern of
 * splitting client creation out of middleware.ts itself). Used only to
 * refresh the Supabase Auth session cookie on every request — organiser
 * identity, not the session-scoped organiser_token/anon_token bearer
 * credentials, which are untouched by this file.
 *
 * Verified against the installed @supabase/ssr@0.12.5 createServerClient
 * signature (node_modules/@supabase/ssr/dist/main/createServerClient.d.ts):
 * `cookies` must implement `getAll`/`setAll` (the non-deprecated overload).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth is not configured — let the request through unmodified. Routes that
  // require an authenticated organiser will fail closed with `not_configured`.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getUser() (not getSession()) is required here — it revalidates
  // the token against Supabase Auth on every request rather than trusting a
  // locally-decoded (and potentially stale/forged) JWT.
  await supabase.auth.getUser();

  return response;
}
