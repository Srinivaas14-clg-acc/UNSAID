import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicParticipant } from "@/lib/types";

/**
 * Server-side helper for computing presence counts, backing
 * GET /api/sessions/[code]/presence as a polling fallback for the
 * browser-side Supabase Realtime Presence channel (which frontend joins
 * directly — this file only covers the server-side aggregate-count helper).
 *
 * Structurally safe by construction (MISSION §6 rule 7 applied here too):
 * this function selects ONLY `id, display_label, joined_at, submitted_at`
 * from `participants` — never `anon_token`, never `session_id`, never a
 * `select *`. There is no code path here that can return response content
 * or claims.
 */
export interface PresenceCounts {
  expected_participants: number | null;
  joined_count: number;
  submitted_count: number;
  participants: PublicParticipant[];
}

export async function getSessionPresence(sessionId: string): Promise<PresenceCounts> {
  const supabase = getSupabaseServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("expected_participants")
    .eq("id", sessionId)
    .single();

  if (sessionError) {
    throw new Error(`Failed to load session for presence: ${sessionError.message}`);
  }

  // Only these four columns — never select *, per rule 7 enforcement notes.
  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("id, display_label, joined_at, submitted_at")
    .eq("session_id", sessionId);

  if (participantsError) {
    throw new Error(`Failed to load participants for presence: ${participantsError.message}`);
  }

  const rows = (participants ?? []) as PublicParticipant[];

  return {
    expected_participants: session?.expected_participants ?? null,
    joined_count: rows.length,
    submitted_count: rows.filter((p) => p.submitted_at !== null).length,
    participants: rows,
  };
}
