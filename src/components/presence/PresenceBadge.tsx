"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { apiGet } from "@/lib/api/client";
import { joinPresenceChannel } from "@/lib/realtime/client-presence";
import type { PresenceResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 4000;

/**
 * "3 of 4 answered" live display. Tries Supabase Realtime Presence first
 * (client-presence.ts); falls back to polling GET /presence when public
 * Supabase env vars aren't configured, per API-CONTRACT.md §10.
 */
export function PresenceBadge({
  code,
  authHeader,
}: {
  code: string;
  authHeader: Record<string, string>;
}) {
  const [presence, setPresence] = useState<PresenceResponse | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const prevSubmitted = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const res = await apiGet<PresenceResponse>(
        `/api/sessions/${code}/presence`,
        authHeader
      );
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === "not_configured") setNotConfigured(true);
        return;
      }
      if (
        prevSubmitted.current !== null &&
        prevSubmitted.current !== res.data.submitted_count
      ) {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 200);
      }
      prevSubmitted.current = res.data.submitted_count;
      setPresence(res.data);
    }

    poll();
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);

    // Realtime channel is supplementary — it just triggers an immediate
    // re-poll on sync so counts stay fresh without waiting for the interval.
    const channel = joinPresenceChannel(code, "room-viewer", () => {
      poll();
    });

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      channel?.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (notConfigured) {
    return (
      <p className="text-sm text-text-tertiary">
        Live presence isn&apos;t available yet — backend not configured.
      </p>
    );
  }

  if (!presence) {
    return <p className="text-sm text-text-tertiary">Loading presence…</p>;
  }

  return (
    <div className="flex items-baseline gap-2">
      <motion.span
        animate={{ opacity: pulse && !reduceMotion ? [1, 0.3, 1] : 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="text-mono-lg text-text-primary"
      >
        {presence.submitted_count}
      </motion.span>
      <span className="text-text-secondary">
        of {presence.joined_count} answered
        {presence.expected_participants
          ? ` (${presence.expected_participants} expected)`
          : ""}
      </span>
    </div>
  );
}
