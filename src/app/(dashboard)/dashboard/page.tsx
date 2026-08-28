"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, isNotConfigured } from "@/lib/api/client";
import type { GetMySessionsResponse } from "@/lib/types";

type SessionRow = GetMySessionsResponse["sessions"][number];

/**
 * Dashboard home. The Sidebar (in the (dashboard) layout) fetches its own
 * copy of GET /api/sessions for the nav list — this page does its own fetch
 * too rather than sharing state across the layout boundary, matching the
 * existing per-component data-fetching convention in this codebase (every
 * page fetches what it needs directly, see room/page.tsx, reveal/page.tsx).
 */
export default function DashboardHomePage() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<GetMySessionsResponse>("/api/sessions");
      if (cancelled) return;
      if (!res.ok) {
        if (isNotConfigured(res)) {
          setErrorMessage(
            "Unsaid isn't connected to its backend yet — sessions can't load until it's configured."
          );
        } else if (res.code !== "unauthorized") {
          setErrorMessage(res.message || "Couldn't load your sessions.");
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

  return (
    <main data-state="private" className="flex min-w-0 flex-1 flex-col gap-10 px-8 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-upright">Your sessions</h1>
        <p className="max-w-[65ch] text-text-secondary">
          Every question you&apos;ve asked, and what came back.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      {sessions === null ? (
        <p className="text-text-secondary">Loading…</p>
      ) : sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {sessions.map((s) => (
            <li key={s.code} className="min-w-0">
              <Link
                href={`/s/${s.code}/room`}
                className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong"
              >
                <span className="line-clamp-2 min-w-0 break-words text-body-emphasis text-text-primary">
                  {s.question}
                </span>
                <span className="text-caption">
                  {s.state} · code {s.code}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-8">
      <span className="text-caption">Nothing here yet</span>
      <p className="max-w-[55ch] text-text-secondary">
        Start a session from the sidebar — write the question, everyone
        answers privately, the reveal shows what actually holds up.
      </p>
    </div>
  );
}
