"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { apiGet, isNotConfigured } from "@/lib/api/client";
import { saveOrganiserToken } from "@/lib/api/storage";
import type { GetMySessionsResponse } from "@/lib/types";

type SessionRow = GetMySessionsResponse["sessions"][number];

function isActive(session: SessionRow): boolean {
  if (session.state === "revealed") return false;
  return new Date(session.deadline).getTime() > Date.now();
}

export function Sidebar({
  onNewSession,
}: {
  onNewSession: () => void;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setUser(data.user ?? null);
      });
    } catch {
      // Supabase not configured — leave user null, sidebar renders the
      // signed-out shell rather than throwing.
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<GetMySessionsResponse>("/api/sessions");
      if (cancelled) return;
      if (!res.ok) {
        if (!isNotConfigured(res)) {
          setLoadError(res.message || "Couldn't load your sessions.");
        }
        setSessions([]);
        return;
      }
      setSessions(res.data.sessions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Not configured — nothing to sign out of.
    }
    router.push("/");
  }

  const activeSessions = (sessions ?? []).filter(isActive);
  const pastSessions = (sessions ?? []).filter((s) => !isActive(s));

  const content = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm font-semibold text-text-primary">
          Unsaid
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="text-text-secondary hover:text-text-primary md:hidden"
        >
          <CloseIcon />
        </button>
      </div>

      <button
        type="button"
        onClick={onNewSession}
        className="flex h-10 items-center justify-center gap-2 rounded-sm border border-border bg-surface text-sm font-medium text-text-primary transition-colors duration-150 hover:border-ember hover:text-ember focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
      >
        + New session
      </button>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto">
        <SessionGroup
          label="Active"
          sessions={activeSessions}
          loading={sessions === null}
          emptyText="No active sessions."
        />
        <SessionGroup
          label="Past"
          sessions={pastSessions}
          loading={sessions === null}
          emptyText="No past sessions yet."
        />
        {loadError && (
          <p role="alert" className="text-xs text-danger">
            {loadError}
          </p>
        )}
      </nav>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <div
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-medium text-text-secondary"
          >
            {(user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <span className="truncate text-sm text-text-secondary">
            {user?.email ?? "Not signed in"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="shrink-0 text-xs font-medium text-text-tertiary hover:text-text-primary"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:flex">
        {content}
      </aside>

      {/* Mobile/narrow: hamburger trigger + drawer, under the 860px breakpoint
          used elsewhere in the app for this kind of collapse. */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <Link href="/dashboard" className="text-sm font-semibold text-text-primary">
          Unsaid
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="text-text-secondary hover:text-text-primary"
        >
          <MenuIcon />
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-[#0A0B0D]/70"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative h-full w-72 border-r border-border bg-surface shadow-float">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

function SessionGroup({
  label,
  sessions,
  loading,
  emptyText,
}: {
  label: string;
  sessions: SessionRow[];
  loading: boolean;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption">{label}</span>
      {loading ? (
        <p className="text-xs text-text-tertiary">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-text-tertiary">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sessions.map((s) => (
            <li key={s.code}>
              <Link
                href={`/s/${s.code}/room`}
                onClick={() => saveOrganiserToken(s.code, s.organiser_token)}
                className="block truncate rounded-sm px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-surface-raised hover:text-text-primary"
                title={s.question}
              >
                {s.question}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
