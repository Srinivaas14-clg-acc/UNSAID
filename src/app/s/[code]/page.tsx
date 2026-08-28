"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { apiGet, apiPost, isNotConfigured } from "@/lib/api/client";
import { getParticipant, saveParticipant } from "@/lib/api/storage";
import type {
  GetSessionResponse,
  JoinSessionRequest,
  JoinSessionResponse,
} from "@/lib/types";

type Stage = "loading" | "ready" | "joining" | "error" | "not_found" | "closed";

export default function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [stage, setStage] = useState<Stage>("loading");
  const [question, setQuestion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Already joined this session on this device — skip straight to /talk.
    const existing = getParticipant(code);
    if (existing) {
      router.replace(`/s/${code}/talk`);
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await apiGet<GetSessionResponse>(`/api/sessions/${code}`);
      if (cancelled) return;
      if (!res.ok) {
        if (isNotConfigured(res)) {
          setErrorMessage(
            "Unsaid isn't connected to its backend yet. This session can't be loaded until it's configured."
          );
          setStage("error");
        } else if (res.code === "not_found") {
          setStage("not_found");
        } else {
          setErrorMessage(res.message || "Couldn't load this session.");
          setStage("error");
        }
        return;
      }
      if (res.data.session.state !== "open") {
        setStage("closed");
        return;
      }
      setQuestion(res.data.session.question);
      setStage("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  async function handleJoin() {
    setStage("joining");
    const payload: JoinSessionRequest = {};
    const res = await apiPost<JoinSessionResponse>(
      `/api/sessions/${code}/join`,
      payload
    );
    if (!res.ok) {
      if (isNotConfigured(res)) {
        setErrorMessage(
          "Unsaid isn't connected to its backend yet — joining isn't possible until it's configured."
        );
      } else {
        setErrorMessage(res.message || "Couldn't join this session.");
      }
      setStage("error");
      return;
    }
    saveParticipant(code, res.data.participant_id, res.data.anon_token);
    router.push(`/s/${code}/talk`);
  }

  return (
    <main
      data-state="private"
      className="flex flex-1 flex-col items-center justify-center px-6 py-24"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        {stage === "loading" && (
          <p className="text-text-secondary">Loading session…</p>
        )}

        {stage === "not_found" && (
          <>
            <h2 className="text-heading-upright">Session not found</h2>
            <p className="max-w-[50ch] text-text-secondary">
              Double check the code — it&apos;s four characters, shared by
              whoever set up this session.
            </p>
          </>
        )}

        {stage === "closed" && (
          <>
            <h2 className="text-heading-upright">This session is closed</h2>
            <p className="max-w-[50ch] text-text-secondary">
              It&apos;s no longer accepting answers. If a reveal is ready, ask
              the organiser for the link.
            </p>
          </>
        )}

        {stage === "error" && (
          <>
            <h2 className="text-heading-upright">Something isn&apos;t working</h2>
            <p role="alert" className="max-w-[50ch] text-danger">
              {errorMessage}
            </p>
          </>
        )}

        {(stage === "ready" || stage === "joining") && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full flex-col items-center gap-8"
          >
            <div className="flex flex-col gap-2">
              <span className="text-caption">The question</span>
              <p className="max-w-[50ch] text-body text-text-primary">
                {question}
              </p>
            </div>
            <p className="max-w-[45ch] text-sm text-text-tertiary">
              Your answers stay private. Nobody sees who said what.
            </p>
            <Button
              accent="ember"
              size="lg"
              onClick={handleJoin}
              disabled={stage === "joining"}
              className="w-full"
            >
              {stage === "joining" ? "Joining…" : "Join"}
            </Button>
          </motion.div>
        )}
      </div>
    </main>
  );
}
