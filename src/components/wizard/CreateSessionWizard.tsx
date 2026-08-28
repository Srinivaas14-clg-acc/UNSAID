"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { FocusInput, FocusTextarea } from "@/components/ui/FocusInput";
import { apiPost, isNotConfigured } from "@/lib/api/client";
import { saveOrganiserToken } from "@/lib/api/storage";
import type { CreateSessionRequest, CreateSessionResponse } from "@/lib/types";

type ShareMethod = "link" | "qr" | "zoom";
type DurationOption = "5m" | "15m" | "1h" | "24h" | "custom";

const DURATION_MS: Record<Exclude<DurationOption, "custom">, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

const DURATION_LABELS: { id: DurationOption; label: string }[] = [
  { id: "5m", label: "5 min" },
  { id: "15m", label: "15 min" },
  { id: "1h", label: "1 hour" },
  { id: "24h", label: "24 hours" },
  { id: "custom", label: "Custom" },
];

const SHARE_METHODS: { id: ShareMethod; label: string; helper: string }[] = [
  { id: "link", label: "Link", helper: "Share a join link directly." },
  { id: "qr", label: "QR code", helper: "Display a scannable code in the room." },
  { id: "zoom", label: "Zoom", helper: "Send questions live during a call." },
];

type Step = 1 | 2 | 3 | 4;
type SubmitStage = "idle" | "submitting" | "error" | "unauthorized";

function defaultCustomDatetime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * 4-step organiser session-creation wizard. Step 1's title+context fold into
 * a single `question` string at submit time (CreateSessionRequest has no
 * separate context field — see docs/API-CONTRACT.md). Step 2's share method
 * is purely client-side routing (no backing API field): Zoom routes to the
 * static LiveModeratorPanel after creation instead of the normal waiting
 * room.
 */
export function CreateSessionWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [step, setStep] = useState<Step>(1);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");

  const [shareMethod, setShareMethod] = useState<ShareMethod>("link");

  const [duration, setDuration] = useState<DurationOption>("15m");
  const [customDatetime, setCustomDatetime] = useState(defaultCustomDatetime());

  const [submitStage, setSubmitStage] = useState<SubmitStage>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function computeDeadlineIso(): string {
    if (duration === "custom") {
      return new Date(customDatetime).toISOString();
    }
    return new Date(Date.now() + DURATION_MS[duration]).toISOString();
  }

  function composeQuestion(): string {
    const t = title.trim();
    const c = context.trim();
    if (!c) return t;
    return `${t}\n\n${c}`;
  }

  async function handleCreate() {
    setSubmitStage("submitting");
    setErrorMessage("");

    const payload: CreateSessionRequest = {
      question: composeQuestion(),
      template: "decision",
      deadline: computeDeadlineIso(),
    };

    const res = await apiPost<CreateSessionResponse>("/api/sessions", payload);

    if (!res.ok) {
      if (isNotConfigured(res)) {
        setErrorMessage(
          "Unsaid isn't connected to its backend yet — sessions can't be created until it's configured."
        );
        setSubmitStage("error");
        return;
      }
      if (res.code === "unauthorized") {
        setSubmitStage("unauthorized");
        setErrorMessage("Your sign-in expired. Sign in again to continue.");
        return;
      }
      setErrorMessage(res.message || "Couldn't create the session. Try again.");
      setSubmitStage("error");
      return;
    }

    saveOrganiserToken(res.data.code, res.data.organiser_token);

    if (shareMethod === "zoom") {
      router.push(`/s/${res.data.code}/room?share=zoom`);
    } else {
      router.push(`/s/${res.data.code}/room`);
    }
    onClose();
  }

  const canAdvanceFrom1 = title.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0B0D]/70 px-4">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-full max-w-lg flex-col gap-8 rounded-lg border border-border bg-surface p-8"
        role="dialog"
        aria-modal="true"
        aria-label="New session"
        data-state="private"
      >
        <div className="flex items-center justify-between">
          <span className="text-caption">Step {step} of 4</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-tertiary hover:text-text-primary"
          >
            <CloseGlyph />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <StepWrap key="1" reduceMotion={!!reduceMotion}>
              <h2 className="text-heading-upright">What&apos;s the question?</h2>
              <div className="flex flex-col gap-2">
                <label htmlFor="wiz-title" className="text-caption">
                  Title
                </label>
                <FocusInput
                  id="wiz-title"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Should we push the launch by two weeks?"
                  maxLength={200}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="wiz-context" className="text-caption">
                  Context (optional)
                </label>
                <FocusTextarea
                  id="wiz-context"
                  rows={4}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Anything participants should know before answering…"
                />
              </div>
              <WizardNav
                onNext={() => setStep(2)}
                nextDisabled={!canAdvanceFrom1}
              />
            </StepWrap>
          )}

          {step === 2 && (
            <StepWrap key="2" reduceMotion={!!reduceMotion}>
              <h2 className="text-heading-upright">How will people join?</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {SHARE_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setShareMethod(m.id)}
                    className={`flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition-colors duration-150 ${
                      shareMethod === m.id
                        ? "border-ember bg-ember-tint"
                        : "border-border hover:border-border-strong"
                    }`}
                  >
                    <span className="text-sm font-semibold text-text-primary">
                      {m.label}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {m.helper}
                    </span>
                  </button>
                ))}
              </div>
              <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
            </StepWrap>
          )}

          {step === 3 && (
            <StepWrap key="3" reduceMotion={!!reduceMotion}>
              <h2 className="text-heading-upright">How long is this open?</h2>
              <div className="flex flex-wrap gap-2">
                {DURATION_LABELS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDuration(d.id)}
                    className={`rounded-sm border px-3 py-2 text-sm transition-colors duration-150 ${
                      duration === d.id
                        ? "border-ember bg-ember-tint text-ember"
                        : "border-border bg-surface text-text-secondary hover:border-border-strong"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {duration === "custom" && (
                <div className="flex flex-col gap-2 pt-1">
                  <label htmlFor="wiz-custom-deadline" className="text-caption">
                    Deadline
                  </label>
                  <input
                    id="wiz-custom-deadline"
                    type="datetime-local"
                    value={customDatetime}
                    onChange={(e) => setCustomDatetime(e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-focus-ring"
                  />
                </div>
              )}
              <WizardNav onBack={() => setStep(2)} onNext={() => setStep(4)} />
            </StepWrap>
          )}

          {step === 4 && (
            <StepWrap key="4" reduceMotion={!!reduceMotion}>
              <h2 className="text-heading-upright">Review</h2>
              <div className="flex flex-col gap-4">
                <ReviewRow label="Title" value={title || "—"} />
                {context.trim() && (
                  <ReviewRow label="Context" value={context.trim()} />
                )}
                <ReviewRow
                  label="Share method"
                  value={SHARE_METHODS.find((m) => m.id === shareMethod)?.label ?? "—"}
                />
                <ReviewRow
                  label="Duration"
                  value={
                    duration === "custom"
                      ? new Date(customDatetime).toLocaleString()
                      : DURATION_LABELS.find((d) => d.id === duration)?.label ?? "—"
                  }
                />
              </div>

              {(submitStage === "error" || submitStage === "unauthorized") && (
                <p role="alert" className="text-sm text-danger">
                  {errorMessage}
                </p>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  accent="ember"
                  onClick={() => setStep(3)}
                  disabled={submitStage === "submitting"}
                >
                  Back
                </Button>
                {submitStage === "unauthorized" ? (
                  <Button
                    type="button"
                    accent="ember"
                    onClick={() => router.push("/")}
                  >
                    Sign in again
                  </Button>
                ) : (
                  <Button
                    type="button"
                    accent="ember"
                    onClick={handleCreate}
                    disabled={submitStage === "submitting"}
                  >
                    {submitStage === "submitting"
                      ? "Creating…"
                      : "Create session"}
                  </Button>
                )}
              </div>
            </StepWrap>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function StepWrap({
  children,
  reduceMotion,
}: {
  children: React.ReactNode;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-6"
    >
      {children}
    </motion.div>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? (
        <Button type="button" variant="ghost" accent="ember" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button
        type="button"
        accent="ember"
        onClick={onNext}
        disabled={nextDisabled}
      >
        Continue
      </Button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption">{label}</span>
      <p className="whitespace-pre-wrap text-sm text-text-primary">{value}</p>
    </div>
  );
}

function CloseGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
