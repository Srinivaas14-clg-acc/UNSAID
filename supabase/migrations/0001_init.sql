-- Unsaid — core schema
-- Every table that can identify a person is never joined directly to synthesis output.
-- Raw transcripts are deleted after extraction (see cleanup job / synthesize route).

create extension if not exists "pgcrypto";

create type session_state as enum ('open', 'closed', 'revealed');
create type session_template as enum (
  'decision', 'retro', 'exit', 'stay', 'pulse', 'debrief', 'policy_reaction'
);
create type consent_level as enum ('share_freely', 'use_dont_quote', 'ignore');

-- A decision session created by an organiser.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- 4-character join code
  question text not null,
  template session_template not null default 'decision',
  deadline timestamptz not null,
  state session_state not null default 'open',
  expected_participants int,               -- optional, drives "3 of 4 answered" presence
  organiser_token text not null,           -- bearer token for the organiser, never shown to participants
  created_at timestamptz not null default now()
);

-- A participant in a session. No identity required — anon_token is a client-held secret.
create table participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  anon_token text not null,
  display_label text,                      -- optional self-chosen label, never required
  joined_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (session_id, anon_token)
);

-- One raw response turn (voice or text) inside a participant's private elicitation.
-- Deleted (transcript wiped) once extraction has run — see synthesize route.
create table responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  turn_index int not null,                 -- 1..3, the probe question index
  probe text not null,                     -- which probe was asked
  transcript text,                         -- nulled out after extraction
  consent consent_level,
  created_at timestamptz not null default now()
);

-- Structured claims extracted per-participant, in isolation. This is the ONLY
-- thing the aggregator ever reads — never a raw transcript.
create table claims (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  claim_id text not null,                  -- stable slug, e.g. "budget-constraint"
  claim text not null,
  stance text,                             -- for/against/neutral, template-dependent
  intensity int,                           -- 1-5
  category text,
  consent consent_level not null,
  created_at timestamptz not null default now()
);

-- Final synthesis, computed once and cached. Never references participant_id directly
-- in surfaced text — corroboration counts only.
create table syntheses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  agreement jsonb not null default '[]',
  disagreement jsonb not null default '[]',
  quiet_constraints_count int not null default 0,
  recommendation text,
  reframe_question text,
  no_disagreement_found boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_participants_session on participants(session_id);
create index idx_responses_session on responses(session_id);
create index idx_claims_session on claims(session_id);
create index idx_sessions_code on sessions(code);

-- Row Level Security: participants and organisers reach data only through
-- server-side routes using the service role. No client-side direct table access.
alter table sessions enable row level security;
alter table participants enable row level security;
alter table responses enable row level security;
alter table claims enable row level security;
alter table syntheses enable row level security;

-- No public policies are defined — all access goes through API routes using
-- the service-role key on the server. This enforces the "no de-anonymisation,
-- ever" rule at the infrastructure level, not just in application code.
