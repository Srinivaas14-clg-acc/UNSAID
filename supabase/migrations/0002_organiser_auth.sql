-- 0002_organiser_auth.sql
-- FIRST DRAFT — 09-database-data-engineer has sole ownership of this
-- directory per CLAUDE.md and should review/approve before this is final.
-- Drafted by 11-integration-engineer as part of organiser-only Google OAuth
-- login (hackathon solo-build context; created ahead of formal review).
--
-- Adds real organiser identity via Supabase Auth (auth.users), additive only.
-- organiser_token remains the session-scoped bearer credential used by
-- synthesize/reveal/presence/join/probe/respond/consent/submit routes (see
-- docs/API-CONTRACT.md). This column adds account-level ownership so an
-- organiser can list/reopen their past sessions across devices.

alter table sessions
  add column organiser_user_id uuid references auth.users(id) on delete set null;

create index idx_sessions_organiser_user on sessions(organiser_user_id);

-- No RLS policy changes: sessions RLS stays enabled with zero policies.
-- All access continues through service-role API routes. Supabase Auth
-- identity is verified server-side (via @supabase/ssr reading the session
-- cookie) inside route handlers, then used as a plain WHERE-clause filter
-- against the service-role client -- never as a client-side RLS policy.
