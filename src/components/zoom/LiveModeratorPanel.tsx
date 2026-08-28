"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

interface MockQuestion {
  id: string;
  text: string;
  responseCount: number;
}

const MOCK_QUESTIONS: MockQuestion[] = [
  {
    id: "q1",
    text: "What's the one thing about this launch nobody's said out loud yet?",
    responseCount: 4,
  },
  {
    id: "q2",
    text: "Where do you actually disagree with the current plan?",
    responseCount: 2,
  },
  {
    id: "q3",
    text: "What would make you comfortable moving the deadline?",
    responseCount: 0,
  },
];

/**
 * Static Zoom moderator shell — VISUALLY COMPLETE, FUNCTIONALLY STATIC per
 * explicit product decision. Never calls a real API, never claims to reach
 * an actual Zoom meeting, never shows a fake "sent!" confirmation. The
 * disabled state and helper copy are the honesty mechanism — this is a
 * stated project value, not a corner cut under time pressure.
 */
export function LiveModeratorPanel({ code }: { code: string }) {
  const [draft, setDraft] = useState("");
  const [localQueue, setLocalQueue] = useState<string[]>([]);

  function handleAddLocally(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    // Local component state only — never reaches any API, never simulates
    // delivery to an actual Zoom meeting.
    setLocalQueue((q) => [...q, text]);
    setDraft("");
  }

  return (
    <div data-state="reveal" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="text-caption">Zoom moderator — code {code}</span>
        <h2 className="text-heading-upright">Live question feed</h2>
        <p className="max-w-[60ch] text-sm text-text-secondary">
          A preview of what live Zoom moderation will look like. Nothing on
          this screen is connected to an actual Zoom meeting yet.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-6">
        <span className="text-caption">Sent this session</span>
        <ul className="flex flex-col gap-4">
          {MOCK_QUESTIONS.map((q) => (
            <li key={q.id} className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0">
              <p className="text-sm text-text-primary">{q.text}</p>
              <span className="text-xs text-text-tertiary">
                {q.responseCount} response{q.responseCount === 1 ? "" : "s"} ·
                example data
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {localQueue.length > 0 && (
        <Card className="flex flex-col gap-3 p-6">
          <span className="text-caption">Drafted, not sent</span>
          <ul className="flex flex-col gap-2">
            {localQueue.map((text, i) => (
              <li key={i} className="text-sm text-text-secondary">
                {text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form onSubmit={handleAddLocally} className="flex flex-col gap-3">
        <label htmlFor="zoom-draft" className="text-caption">
          Add a question to send now
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="zoom-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a question…"
            className="flex-1 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-focus-ring"
          />
          <button
            type="submit"
            disabled
            title="Live Zoom integration coming soon"
            aria-disabled="true"
            className="inline-flex h-11 shrink-0 cursor-not-allowed items-center justify-center rounded-sm border border-border bg-surface-raised px-5 text-sm font-medium text-text-tertiary"
          >
            Send to meeting
          </button>
        </div>
        <p className="text-xs text-text-tertiary">
          Live Zoom integration coming soon — this drafts locally and does not
          reach an actual meeting.
        </p>
      </form>
    </div>
  );
}
