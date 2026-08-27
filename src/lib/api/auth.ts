import type { SupabaseClient } from "@supabase/supabase-js";
import type { Participant, Session } from "@/lib/types";

/**
 * Shared token-validation helpers for API routes. Per docs/API-CONTRACT.md
 * §0: the server must verify the token belongs to the specific
 * participant_id / session in the request, not just that *some* valid token
 * was presented.
 */

export async function loadSessionByCode(
  supabase: SupabaseClient,
  code: string
): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to load session: ${error.message}`);
  return (data as Session | null) ?? null;
}

/**
 * Validates that `anonToken` belongs to `participantId` within `sessionId`.
 * Returns the participant row on success, null otherwise.
 */
export async function validateAnonToken(
  supabase: SupabaseClient,
  sessionId: string,
  participantId: string,
  anonToken: string | null
): Promise<Participant | null> {
  if (!anonToken) return null;

  const { data, error } = await supabase
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("session_id", sessionId)
    .eq("anon_token", anonToken)
    .maybeSingle();

  if (error) throw new Error(`Failed to validate anon token: ${error.message}`);
  return (data as Participant | null) ?? null;
}

/** Validates that `organiserToken` matches the given session's organiser_token. */
export function validateOrganiserToken(session: Session, organiserToken: string | null): boolean {
  if (!organiserToken) return false;
  return session.organiser_token === organiserToken;
}

/**
 * Validates that a token (either anon or organiser) belongs to this session,
 * for routes where both roles see the identical payload (reveal, presence).
 * Returns true if either header validates.
 */
export async function validateAnyToken(
  supabase: SupabaseClient,
  session: Session,
  anonToken: string | null,
  organiserToken: string | null
): Promise<boolean> {
  if (organiserToken && validateOrganiserToken(session, organiserToken)) return true;

  if (anonToken) {
    const { data, error } = await supabase
      .from("participants")
      .select("id")
      .eq("session_id", session.id)
      .eq("anon_token", anonToken)
      .maybeSingle();

    if (error) throw new Error(`Failed to validate anon token: ${error.message}`);
    if (data) return true;
  }

  return false;
}
