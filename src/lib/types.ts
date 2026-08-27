/**
 * Shared types for Unsaid — Batch mode MVP.
 *
 * Single source of truth for both API route handlers (src/app/api/**) and
 * frontend components (src/app/s/**, src/components/**). Do not redeclare
 * these shapes elsewhere — import from here.
 *
 * Mirrors supabase/migrations/0001_init.sql exactly for DB row types.
 * Request/response DTOs are grouped per route and documented in
 * docs/API-CONTRACT.md — that file is the narrative spec, this file is the
 * enforceable shape.
 */

// ---------------------------------------------------------------------------
// Enums (mirror Postgres enum types in 0001_init.sql)
// ---------------------------------------------------------------------------

export type SessionState = "open" | "closed" | "revealed";

export type SessionTemplate =
  | "decision"
  | "retro"
  | "exit"
  | "stay"
  | "pulse"
  | "debrief"
  | "policy_reaction";

export type ConsentLevel = "share_freely" | "use_dont_quote" | "ignore";

// Probe library ids (src/lib/probes/library.ts is the canonical source;
// this union must stay in sync with it). "end_early" is a first-class
// moderator outcome, not an error state.
export type ProbeId =
  | "probe_dealbreaker"
  | "probe_unspoken"
  | "probe_confidence"
  | "probe_constraint"
  | "probe_specific"
  | "end_early";

// Q1 is always this fixed probe id, chosen by template — never by the model.
export type FixedFirstProbeId = "probe_q1";

// ---------------------------------------------------------------------------
// DB row types (1:1 with supabase/migrations/0001_init.sql)
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  code: string; // 4-character join code, uppercase unambiguous alphabet
  question: string;
  template: SessionTemplate;
  deadline: string; // ISO 8601 timestamptz
  state: SessionState;
  expected_participants: number | null;
  organiser_token: string; // NEVER serialized to a participant-facing response
  created_at: string;
}

/**
 * Public-safe projection of Session — every response the participant side
 * can see must use this type, never `Session` directly, so a future field
 * added to `Session` can't leak by accident (e.g. organiser_token).
 */
export type PublicSession = Omit<Session, "organiser_token">;

export interface Participant {
  id: string;
  session_id: string;
  anon_token: string; // NEVER serialized outside the join response for this participant
  display_label: string | null;
  joined_at: string;
  submitted_at: string | null;
}

/** Participant projection safe to return to the organiser (room/presence views). */
export type PublicParticipant = Pick<
  Participant,
  "id" | "display_label" | "joined_at" | "submitted_at"
>;

export interface ResponseRow {
  id: string;
  session_id: string;
  participant_id: string;
  turn_index: number; // 1..3
  probe: string; // probe id asked for this turn
  transcript: string | null; // nulled after extraction succeeds (MISSION §6 rule 5)
  consent: ConsentLevel | null; // null until the participant tags it
  created_at: string;
}

export interface Claim {
  id: string;
  session_id: string;
  participant_id: string;
  claim_id: string; // stable slug, e.g. "budget-constraint"
  claim: string;
  stance: string | null; // for/against/neutral, template-dependent
  intensity: number | null; // 1-5
  category: string | null;
  consent: ConsentLevel;
  created_at: string;
}

export interface Synthesis {
  id: string;
  session_id: string;
  agreement: SynthesisClusterView[];
  disagreement: SynthesisClusterView[];
  quiet_constraints_count: number;
  recommendation: string | null;
  reframe_question: string | null;
  no_disagreement_found: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Synthesis payload shapes (the jsonb contents of syntheses.agreement /
// syntheses.disagreement)
// ---------------------------------------------------------------------------

/**
 * One rendered cluster in the reveal. `quotes` contains ONLY claim text from
 * responses with consent === "share_freely" (MISSION §6 rule 2 — a claim
 * corroborated solely by use_dont_quote responses must never appear here as
 * quoted text). `corroboration_count` is always safe to show (a count, not
 * an identity). `claim_ids` are the real claim_id values this cluster traces
 * to, re-verified against the claims table at synthesize time (rule 4).
 */
export interface SynthesisClusterView {
  cluster_id: string;
  summary: string; // model/aggregator-authored structural framing, e.g. "reads as unanimous, is 3-2 on scope"
  quotes: string[]; // verbatim claim text, share_freely only, k>=2 distinct participants
  corroboration_count: number; // distinct participant count backing this cluster
  claim_ids: string[]; // every claim_id folded into this cluster; all verified to exist in `claims`
  category: string | null;
}

// ---------------------------------------------------------------------------
// Aggregator I/O (src/lib/aggregate/aggregator.ts) — pure TS, no network
// ---------------------------------------------------------------------------

/** Aggregator input: extracted claims only, never a transcript. */
export interface AggregatorInput {
  claims: Claim[];
  realClaimIds: Set<string>; // fetched fresh from `claims` table by the caller (synthesize route)
  minParticipants: number; // k threshold, always 2 for Batch mode
}

export interface AggregatorOutput {
  agreement: SynthesisClusterView[];
  disagreement: SynthesisClusterView[];
  quiet_constraints_count: number;
  no_disagreement_found: boolean;
}

// ---------------------------------------------------------------------------
// Gemini call I/O (src/lib/gemini/schemas.ts derives zod from these)
// ---------------------------------------------------------------------------

/** Structured extractor output — one call per participant. Nothing else. */
export interface ExtractedClaim {
  claim_id: string;
  participant_id: string;
  claim: string;
  stance: string | null;
  intensity: number | null; // 1-5
  category: string | null;
  consent: ConsentLevel;
}

/** Moderator function-call decision for the next probe (or end_early). */
export interface ModeratorDecision {
  probe_id: ProbeId;
  // Populated only when probe_id !== "end_early".
  question?: string;
}

// =============================================================================
// API request / response DTOs — one block per route, in the order documented
// in docs/API-CONTRACT.md. Field names match exactly.
// =============================================================================

// --- POST /api/sessions ------------------------------------------------------

export interface CreateSessionRequest {
  question: string;
  template: SessionTemplate;
  deadline: string; // ISO 8601
  expected_participants?: number;
}

export interface CreateSessionResponse {
  code: string;
  organiser_token: string;
  session: PublicSession;
}

// --- GET /api/sessions/[code] ------------------------------------------------

export interface GetSessionResponse {
  session: PublicSession;
}

// --- POST /api/sessions/[code]/join ------------------------------------------

export interface JoinSessionRequest {
  display_label?: string;
}

export interface JoinSessionResponse {
  participant_id: string;
  anon_token: string;
  session: PublicSession;
}

// --- POST /api/sessions/[code]/probe ------------------------------------------

export interface NextProbeRequest {
  participant_id: string;
}

export type NextProbeResponse =
  | {
      done: false;
      turn_index: number; // the turn_index the participant should answer next (1..3)
      probe_id: ProbeId;
      question: string;
    }
  | {
      done: true; // either end_early fired or the 3-turn cap was reached
      reason: "end_early" | "max_turns_reached";
    };

// --- POST /api/sessions/[code]/respond ----------------------------------------

export interface SubmitResponseRequest {
  participant_id: string;
  turn_index: number; // 1..3, must match the next expected turn_index server-side
  probe_id: ProbeId;
  text?: string; // typed fallback
  audio_base64?: string; // voice input, transcribed server-side via Gemini multimodal
  audio_mime_type?: string; // required if audio_base64 present, e.g. "audio/webm"
}

export interface SubmitResponseResponse {
  response_id: string;
  transcript: string; // echoed back so the UI can show the consent-tap screen
}

// --- POST /api/sessions/[code]/consent ----------------------------------------

export interface SubmitConsentRequest {
  participant_id: string;
  response_id: string;
  consent: ConsentLevel;
}

export interface SubmitConsentResponse {
  response_id: string;
  consent: ConsentLevel;
}

// --- POST /api/sessions/[code]/submit ------------------------------------------

export interface SubmitParticipantRequest {
  participant_id: string;
}

export interface SubmitParticipantResponse {
  participant_id: string;
  submitted_at: string;
}

// --- POST /api/sessions/[code]/synthesize --------------------------------------

// Empty body; organiser_token in header authorizes the call.
// Idempotent — safe to call more than once (e.g. accidental double-click,
// retry after a timeout); a cached `syntheses` row is returned unchanged.
export type SynthesizeRequest = Record<string, never>;

export type SynthesizeResponse =
  | { status: "ok"; synthesis: Synthesis }
  | { status: "insufficient_data"; participants_submitted: number; minimum_required: 2 };

// --- GET /api/sessions/[code]/reveal --------------------------------------------

export type RevealResponse =
  | { status: "ready"; synthesis: Synthesis }
  | { status: "not_ready" }; // synthesize has not been run yet (session not closed/revealed)

// --- GET /api/sessions/[code]/presence --------------------------------------------

export interface PresenceResponse {
  expected_participants: number | null;
  joined_count: number;
  submitted_count: number;
  participants: PublicParticipant[]; // display_label + submitted state only, never response content
}

// ---------------------------------------------------------------------------
// Shared error envelope — every route returns this shape on non-2xx.
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "invalid_request"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "session_closed"
  | "max_turns_reached"
  | "not_configured" // Supabase/Gemini env vars missing — caught, not a 500 stack trace
  | "upstream_unavailable" // Gemini call failed
  | "conflict" // e.g. consent already set, participant already submitted
  | "internal_error";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
