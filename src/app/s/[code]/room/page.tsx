"use client";

import { use, useEffect, useState } from "react";
import { PresenceBadge } from "@/components/presence/PresenceBadge";
import { Button } from "@/components/ui/Button";
import { apiGet, apiPost, isNotConfigured } from "@/lib/api/client";
import { getOrganiserToken } from "@/lib/api/storage";
import type {
  GetSessionResponse,
  SynthesizeResponse,
} from "@/lib/types";

type Stage = "loading" | "ready" | "error";
type SynthesizeStage = "idle" | "running" | "insufficient" | "done" | "error";

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  // Read synchronously from localStorage at render time, so "no organiser
  // token" is derived directly rather than written into `stage` state from
  // an effect (there's no async step involved in knowing whether it exists).
  const organiserToken = getOrganiserToken(code);
  const [stage, setStage] = useState<Stage>("loading");
  const [question, setQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [synthStage, setSynthStage] = useState<SynthesizeStage>("idle");
  const [synthMessage, setSynthMessage] = useState("");

  useEffect(() => {
    if (!organiserToken) return;

    let cancelled = false;
    (async () => {
      const res = await apiGet<GetSessionResponse>(`/api/sessions/${code}`);
      if (cancelled) return;
      if (!res.ok) {
        if (isNotConfigured(res)) {
          setErrorMessage(
            "Unsaid isn't connected to its backend yet — this room can't load until it's configured."
          );
        } else {
          setErrorMessage(res.message || "Couldn't load this session.");
        }
        setStage("error");
        return;
      }
      setQuestion(res.data.session.question);
      setStage("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [code, organiserToken]);

  async function handleSynthesize() {
    const organiserToken = getOrganiserToken(code);
    if (!organiserToken) return;
    setSynthStage("running");
    setSynthMessage("");
    const res = await apiPost<SynthesizeResponse>(
      `/api/sessions/${code}/synthesize`,
      {},
      { "X-Organiser-Token": organiserToken }
    );
    if (!res.ok) {
      if (isNotConfigured(res)) {
        setSynthMessage(
          "Synthesis isn't available yet — backend not configured."
        );
      } else {
        setSynthMessage(res.message || "Couldn't run synthesis.");
      }
      setSynthStage("error");
      return;
    }
    if (res.data.status === "insufficient_data") {
      setSynthMessage(
        `Only ${res.data.participants_submitted} participant(s) have submitted — at least ${res.data.minimum_required} are needed before synthesis can run.`
      );
      setSynthStage("insufficient");
      return;
    }
    setSynthStage("done");
  }

  if (!organiserToken) {
    return (
      <CenteredMessage text="This room can only be viewed by the organiser who created it, from the device that created it." />
    );
  }

  if (stage === "loading") {
    return <CenteredMessage text="Loading…" />;
  }

  if (stage === "error") {
    return <CenteredMessage text={errorMessage} tone="danger" />;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2">
        <span className="text-caption">Live room</span>
        <h1>{question}</h1>
        <p className="text-mono text-text-tertiary">Code: {code}</p>
      </div>

      <PresenceBadge
        code={code}
        authHeader={{ "X-Organiser-Token": organiserToken }}
      />

      <div className="flex flex-col gap-3 border-t border-border pt-8">
        <Button
          size="lg"
          onClick={handleSynthesize}
          disabled={synthStage === "running" || synthStage === "done"}
          className="w-fit"
        >
          {synthStage === "running" ? "Synthesising…" : "Run synthesis"}
        </Button>

        {synthStage === "done" && (
          <a
            href={`/s/${code}/reveal`}
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            View the reveal →
          </a>
        )}

        {(synthStage === "insufficient" || synthStage === "error") && (
          <p role="alert" className="text-sm text-danger">
            {synthMessage}
          </p>
        )}
      </div>

      <p className="max-w-[55ch] text-sm text-text-tertiary">
        This is everything you can see. No individual answers, no names — the
        reveal is the same for everyone, including you.
      </p>
    </main>
  );
}

function CenteredMessage({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "danger";
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <p
        role={tone === "danger" ? "alert" : undefined}
        className={`max-w-[50ch] text-center ${
          tone === "danger" ? "text-danger" : "text-text-secondary"
        }`}
      >
        {text}
      </p>
    </main>
  );
}
