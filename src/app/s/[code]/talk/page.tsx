"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ProbeProgress } from "@/components/elicit/ProbeProgress";
import { VoiceRecorder } from "@/components/elicit/VoiceRecorder";
import { TextFallback } from "@/components/elicit/TextFallback";
import { ConsentTap } from "@/components/elicit/ConsentTap";
import { AmbientWave } from "@/components/elicit/AmbientWave";
import { apiPost, isNotConfigured } from "@/lib/api/client";
import { getParticipant } from "@/lib/api/storage";
import type {
  ConsentLevel,
  NextProbeResponse,
  SubmitConsentRequest,
  SubmitConsentResponse,
  SubmitParticipantRequest,
  SubmitParticipantResponse,
  SubmitResponseRequest,
  SubmitResponseResponse,
} from "@/lib/types";

type Phase =
  | "loading"
  | "asking"
  | "capturing"
  | "consenting"
  | "advancing"
  | "complete"
  | "no_participant"
  | "error";

interface CurrentTurn {
  turn_index: number;
  probe_id: string;
  question: string;
}

export default function TalkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [turn, setTurn] = useState<CurrentTurn | null>(null);
  const [pendingResponseId, setPendingResponseId] = useState<string | null>(
    null
  );
  const [answeredCount, setAnsweredCount] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const participant = getParticipant(code);

  const headers = participant
    ? { "X-Anon-Token": participant.anon_token }
    : null;

  // Plain (non-memoized) async functions rather than useCallback: they're
  // invoked from the mount effect below (as an inline call, same pattern as
  // room/page.tsx) and from the submitConsent event handler — neither needs
  // referential stability, and inlining avoids a circular-dependency ref.
  async function finishParticipant() {
    if (!participant || !headers) return;
    const payload: SubmitParticipantRequest = {
      participant_id: participant.participant_id,
    };
    const res = await apiPost<SubmitParticipantResponse>(
      `/api/sessions/${code}/submit`,
      payload,
      headers
    );
    if (!res.ok) {
      if (isNotConfigured(res)) {
        setErrorMessage(
          "Unsaid isn't connected to its backend yet — can't finish the session until it's configured."
        );
        setPhase("error");
        return;
      }
      // If nothing was answered/consented yet this can legitimately fail;
      // still land the participant in a calm completion state rather than
      // a dead-end error, since the elicitation itself is over.
    }
    setPhase("complete");
  }

  async function fetchNextProbe() {
    if (!participant || !headers) {
      setPhase("no_participant");
      return;
    }
    setPhase("advancing");
    const res = await apiPost<NextProbeResponse>(
      `/api/sessions/${code}/probe`,
      { participant_id: participant.participant_id },
      headers
    );
    if (!res.ok) {
      if (isNotConfigured(res)) {
        setErrorMessage(
          "Unsaid isn't connected to its backend yet — this session can't run until it's configured."
        );
      } else {
        setErrorMessage(res.message || "Couldn't load the next question.");
      }
      setPhase("error");
      return;
    }
    if (res.data.done) {
      await finishParticipant();
      return;
    }
    setTurn({
      turn_index: res.data.turn_index,
      probe_id: res.data.probe_id,
      question: res.data.question,
    });
    setPhase("asking");
  }

  useEffect(() => {
    if (!participant) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchNextProbe();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // `participant` is read synchronously from localStorage on every render
  // (see getParticipant above), so "no participant" is derived directly
  // here rather than written into `phase` state from the effect above.
  const effectivePhase: Phase = !participant ? "no_participant" : phase;

  async function submitAnswer(payload: {
    text?: string;
    audio_base64?: string;
    audio_mime_type?: string;
  }) {
    if (!participant || !headers || !turn) return;
    setPhase("capturing");
    const body: SubmitResponseRequest = {
      participant_id: participant.participant_id,
      turn_index: turn.turn_index,
      probe_id: turn.probe_id as SubmitResponseRequest["probe_id"],
      ...payload,
    };
    const res = await apiPost<SubmitResponseResponse>(
      `/api/sessions/${code}/respond`,
      body,
      headers
    );
    if (!res.ok) {
      if (isNotConfigured(res)) {
        setErrorMessage(
          "Unsaid isn't connected to its backend yet — answers can't be submitted until it's configured."
        );
      } else {
        setErrorMessage(res.message || "Couldn't submit that answer. Try again.");
      }
      setPhase("error");
      return;
    }
    setPendingResponseId(res.data.response_id);
    setPhase("consenting");
  }

  async function submitConsent(consent: ConsentLevel) {
    if (!participant || !headers || !pendingResponseId) return;
    const body: SubmitConsentRequest = {
      participant_id: participant.participant_id,
      response_id: pendingResponseId,
      consent,
    };
    const res = await apiPost<SubmitConsentResponse>(
      `/api/sessions/${code}/consent`,
      body,
      headers
    );
    setPendingResponseId(null);
    setAnsweredCount((c) => c + 1);
    if (!res.ok && !isNotConfigured(res)) {
      // Consent tagging failure shouldn't strand the participant — advance
      // anyway; the aggregator's k>=2/consent gate is the real backstop.
    }
    fetchNextProbe();
  }

  if (effectivePhase === "no_participant") {
    return (
      <CenteredMessage text="You haven't joined this session yet.">
        <button
          onClick={() => router.push(`/s/${code}`)}
          className="text-sm font-medium text-ember hover:text-ember-hover"
        >
          Go join →
        </button>
      </CenteredMessage>
    );
  }

  if (phase === "error") {
    return <CenteredMessage text={errorMessage} tone="danger" />;
  }

  if (phase === "complete") {
    return (
      <CenteredMessage text="That's everything. Thank you — your answers stay private.">
        <p className="max-w-[45ch] text-sm text-text-tertiary">
          The reveal appears once everyone has finished, or the deadline
          passes.
        </p>
      </CenteredMessage>
    );
  }

  if (phase === "loading" || phase === "advancing") {
    return <CenteredMessage text="Loading…" />;
  }

  return (
    <main
      data-state="private"
      className="flex flex-1 flex-col items-center px-6 py-16"
    >
      <div className="flex w-full max-w-lg flex-col gap-10">
        <ProbeProgress current={answeredCount} />

        <AnimatePresence mode="wait">
          {phase === "consenting" ? (
            <motion.div
              key="consent"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <ConsentTap onSelect={submitConsent} />
            </motion.div>
          ) : (
            turn && (
              <motion.div
                key={turn.turn_index}
                initial={
                  reduceMotion ? false : { opacity: 0, y: 8 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.05,
                }}
                className="flex flex-col gap-8"
              >
                <h2>{turn.question}</h2>

                <div className="flex flex-col items-center gap-6">
                  <AmbientWave level={liveLevel} recording={isRecording} />

                  <VoiceRecorder
                    disabled={phase === "capturing"}
                    onCaptured={(audio_base64, audio_mime_type) =>
                      submitAnswer({ audio_base64, audio_mime_type })
                    }
                    onLevelChange={setLiveLevel}
                    onRecordingChange={setIsRecording}
                  />
                </div>

                <div className="flex justify-center">
                  <TextFallback
                    disabled={phase === "capturing"}
                    onSubmit={(text) => submitAnswer({ text })}
                  />
                </div>

                <p className="text-center text-xs text-text-tertiary">
                  Your answers stay private. Nobody sees who said what.
                </p>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function CenteredMessage({
  text,
  tone = "default",
  children,
}: {
  text: string;
  tone?: "default" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <main
      data-state="private"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24"
    >
      <p
        role={tone === "danger" ? "alert" : undefined}
        className={`max-w-[50ch] text-center ${
          tone === "danger" ? "text-danger" : "text-text-secondary"
        }`}
      >
        {text}
      </p>
      {children}
    </main>
  );
}
