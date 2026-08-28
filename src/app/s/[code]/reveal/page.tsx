"use client";

import { use, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AgreementPanel } from "@/components/reveal/AgreementPanel";
import { DisagreementPanel } from "@/components/reveal/DisagreementPanel";
import { QuietConstraintsPanel } from "@/components/reveal/QuietConstraintsPanel";
import { RecommendationPanel } from "@/components/reveal/RecommendationPanel";
import { DepthReadingChart } from "@/components/reveal/DepthReadingChart";
import { apiGet, isNotConfigured } from "@/lib/api/client";
import { getOrganiserToken, getParticipant } from "@/lib/api/storage";
import type { RevealResponse, Synthesis } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;

type Stage = "loading" | "waiting" | "ready" | "error" | "unauthorized";

/**
 * Linear-style reveal dashboard. Polls GET /reveal until synthesis is ready
 * so it never renders broken/partial data — shows a calm waiting state
 * ("not_ready") in the meantime, then a one-time panel stagger on first
 * render of real content (DESIGN.md §5).
 */
export default function RevealPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [stage, setStage] = useState<Stage>("loading");
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const hasAuth = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    function authHeader(): Record<string, string> | null {
      const organiserToken = getOrganiserToken(code);
      if (organiserToken) return { "X-Organiser-Token": organiserToken };
      const participant = getParticipant(code);
      if (participant) return { "X-Anon-Token": participant.anon_token };
      return null;
    }

    async function poll() {
      const headers = authHeader();
      if (!headers) {
        if (!cancelled) setStage("unauthorized");
        return;
      }
      hasAuth.current = true;
      const res = await apiGet<RevealResponse>(
        `/api/sessions/${code}/reveal`,
        headers
      );
      if (cancelled) return;
      if (!res.ok) {
        if (isNotConfigured(res)) {
          setErrorMessage(
            "The reveal can't be loaded yet — backend not configured."
          );
        } else {
          setErrorMessage(res.message || "Couldn't load the reveal.");
        }
        setStage("error");
        return;
      }
      if (res.data.status === "not_ready") {
        setStage("waiting");
        return;
      }
      setSynthesis(res.data.synthesis);
      setStage("ready");
    }

    poll();
    const intervalId = window.setInterval(() => {
      // Stop polling once ready — the payload is cached and static per
      // API-CONTRACT.md, no need to keep hitting the route.
      if (stage !== "ready") poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (stage === "loading") {
    return <CenteredMessage text="Loading…" />;
  }

  if (stage === "unauthorized") {
    return (
      <CenteredMessage text="You need to join or organise this session to view its reveal." />
    );
  }

  if (stage === "error") {
    return <CenteredMessage text={errorMessage} tone="danger" />;
  }

  if (stage === "waiting") {
    return (
      <CenteredMessage text="Waiting for synthesis. This page will update automatically once it's ready." />
    );
  }

  if (!synthesis) return null;

  const allClusters = [...synthesis.agreement, ...synthesis.disagreement];

  const panels = [
    <AgreementPanel key="agreement" clusters={synthesis.agreement} />,
    <DisagreementPanel
      key="disagreement"
      clusters={synthesis.disagreement}
      noDisagreementFound={synthesis.no_disagreement_found}
    />,
    <QuietConstraintsPanel
      key="quiet"
      count={synthesis.quiet_constraints_count}
    />,
    <RecommendationPanel
      key="recommendation"
      recommendation={synthesis.recommendation}
      reframeQuestion={synthesis.reframe_question}
    />,
  ];

  return (
    <main
      data-state="reveal"
      className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-16"
    >
      <h1 className="text-heading-upright">The reveal</h1>
      <div className="flex flex-col gap-12">
        {panels.map((panel, i) => (
          <motion.div
            key={panel.key}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
              delay: reduceMotion ? 0 : i * 0.06,
            }}
          >
            {panel}
          </motion.div>
        ))}
        {allClusters.length > 0 && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
              delay: reduceMotion ? 0 : panels.length * 0.06,
            }}
          >
            <DepthReadingChart clusters={allClusters} />
          </motion.div>
        )}
      </div>
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
    <main
      data-state="reveal"
      className="flex flex-1 flex-col items-center justify-center px-6 py-24"
    >
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
