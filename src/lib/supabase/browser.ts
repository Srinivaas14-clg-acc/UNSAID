import { createBrowserClient } from "@supabase/ssr";

/**
 * @supabase/ssr browser client — for organiser login (Google OAuth trigger)
 * and sign-out from client components. Distinct from, and unrelated to, the
 * service-role client in src/lib/supabase/server.ts and the
 * organiser_token/anon_token bearer credentials used by session-scoped API
 * routes; this client only ever talks to Supabase Auth (auth.users).
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set these in .env.local."
    );
  }

  return createBrowserClient(url, anonKey);
}
