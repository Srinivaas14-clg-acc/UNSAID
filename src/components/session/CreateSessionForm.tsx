"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { FocusInput } from "@/components/ui/FocusInput";
import { Button } from "@/components/ui/Button";
import { apiPost, isNotConfigured } from "@/lib/api/client";
import { saveOrganiserToken } from "@/lib/api/storage";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionTemplate,
} from "@/lib/types";

const TEMPLATES: { id: SessionTemplate; label: string }[] = [
  { id: "decision", label: "Decision" },
  { id: "retro", label: "Retro" },
  { id: "exit", label: "Exit" },
  { id: "stay", label: "Stay" },
  { id: "pulse", label: "Pulse" },
  { id: "debrief", label: "Debrief" },
  { id: "policy_reaction", label: "Policy reaction" },
];

function defaultDeadline(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // Format for <input type="datetime-local">: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

type Stage = "compose" | "submitting" | "error" | "created";

export function CreateSessionForm() {
  const [question, setQuestion] = useState("");
  const [template, setTemplate] = useState<SessionTemplate>("decision");
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [stage, setStage] = useState<Stage>("compose");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<CreateSessionResponse | null>(null);
  const reduceMotion = useReducedMotion();

  const showTemplates = question.trim().length > 0;
  const canSubmit = useMemo(
    () => question.trim().length > 0 && stage !== "submitting",
    [question, stage]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStage("submitting");
    setErrorMessage("");

    const isoDeadline = new Date(deadline).toISOString();
    const payload: CreateSessionRequest = {
      question: question.trim(),
      template,
      deadline: isoDeadline,
    };

    const res = await apiPost<CreateSessionResponse>("/api/sessions", payload);

    if (!res.ok) {
      if (isNotConfigured(res)) {
        setErrorMessage(
          "Unsaid isn't connected to its backend yet — the organiser can't create a session until Supabase is configured. This will work once environment keys are set."
        );
      } else {
        setErrorMessage(res.message || "Couldn't create the session. Try again.");
      }
      setStage("error");
      return;
    }

    saveOrganiserToken(res.data.code, res.data.organiser_token);
    setResult(res.data);
    setStage("created");
  }

  if (stage === "created" && result) {
    return <SessionCreated result={result} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="question" className="text-caption">
          The question
        </label>
        <FocusInput
          id="question"
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Should we push the launch by two weeks?"
          maxLength={500}
        />
      </div>

      <AnimatePresence initial={false}>
        {showTemplates && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{
              duration: reduceMotion ? 0 : 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="flex flex-col gap-3"
          >
            <span className="text-caption">Template</span>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={`rounded-sm border px-3 py-2 text-sm transition-colors duration-150 ${
                    template === t.id
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-border bg-surface text-text-secondary hover:border-border-strong"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <label htmlFor="deadline" className="text-caption">
                Deadline
              </label>
              <input
                id="deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-focus-ring"
              />
            </div>

            <Button
              type="submit"
              accent="ember"
              size="lg"
              disabled={!canSubmit}
              className="mt-2"
            >
              {stage === "submitting" ? "Creating…" : "Create session"}
            </Button>

            {stage === "error" && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

function SessionCreated({ result }: { result: CreateSessionResponse }) {
  const link = typeof window !== "undefined" ? `${window.location.origin}/s/${result.code}` : `/s/${result.code}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <span className="text-caption">Join code</span>
        <p className="text-mono-lg text-accent">{result.code}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption">Share link</span>
        <p className="text-mono break-all text-text-secondary">{link}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-caption">Question</span>
        <p className="text-body">{result.session.question}</p>
      </div>
      <a
        href={`/s/${result.code}/room`}
        className="text-sm font-medium text-accent hover:text-accent-hover"
      >
        Go to live room →
      </a>
    </motion.div>
  );
}
