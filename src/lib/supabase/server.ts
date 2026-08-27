import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key.
 * Never import this from a "use client" component — it bypasses RLS entirely,
 * which is intentional: all access control lives in the API route layer, not
 * in Postgres policies, so that the "no de-anonymisation, ever" rule is
 * enforced by which routes exist rather than by row-level policy logic.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set these in .env.local."
    );
  }

  _client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}
