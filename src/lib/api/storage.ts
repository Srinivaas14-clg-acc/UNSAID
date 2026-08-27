/**
 * localStorage helpers for the two opaque tokens the API contract mints:
 * organiser_token (session creation) and anon_token (participant join).
 * Keyed by session code per the frontend-lead brief. No accounts, no cookies
 * — matches MISSION §9 (no auth/accounts for participants).
 */

interface OrganiserRecord {
  organiser_token: string;
}

interface ParticipantRecord {
  participant_id: string;
  anon_token: string;
}

const organiserKey = (code: string) => `unsaid:organiser:${code}`;
const participantKey = (code: string) => `unsaid:participant:${code}`;

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, quota) — degrade silently, the
    // caller's flow will just re-prompt rather than crash.
  }
}

export function saveOrganiserToken(code: string, organiser_token: string) {
  safeSet(organiserKey(code), JSON.stringify({ organiser_token }));
}

export function getOrganiserToken(code: string): string | null {
  const raw = safeGet(organiserKey(code));
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as OrganiserRecord).organiser_token ?? null;
  } catch {
    return null;
  }
}

export function saveParticipant(
  code: string,
  participant_id: string,
  anon_token: string
) {
  safeSet(participantKey(code), JSON.stringify({ participant_id, anon_token }));
}

export function getParticipant(code: string): ParticipantRecord | null {
  const raw = safeGet(participantKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParticipantRecord;
  } catch {
    return null;
  }
}
