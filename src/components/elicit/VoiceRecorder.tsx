"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  startRecording,
  blobToBase64,
  type RecorderHandle,
} from "@/lib/audio/recorder";

interface VoiceRecorderProps {
  onCaptured: (audioBase64: string, mimeType: string) => void;
  disabled?: boolean;
  /**
   * Optional pass-through of the live RMS level (0..1) and recording state,
   * additive to existing behavior — lets a parent drive the ambient sine
   * wave motif (DESIGN.md §5.1) from the same signal already used for the
   * level ring below, without duplicating the mic/analyser setup.
   */
  onLevelChange?: (level: number) => void;
  onRecordingChange?: (recording: boolean) => void;
}

/**
 * Hold-to-talk mic button. The level ring's radius/opacity maps directly to
 * live RMS amplitude on every frame — DESIGN.md §5: "data-driven, not
 * decorative," no easing on the amplitude mapping itself. The
 * resting<->active state transition uses 200ms ease-out / 150ms ease-in.
 * Under prefers-reduced-motion, the ring becomes opacity-only with no radius
 * change (still functional feedback, per DESIGN.md's explicit carve-out).
 */
export function VoiceRecorder({
  onCaptured,
  disabled,
  onLevelChange,
  onRecordingChange,
}: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<RecorderHandle | null>(null);
  const reduceMotion = useReducedMotion();

  const handleStart = useCallback(async () => {
    if (disabled || recording) return;
    setError(null);
    try {
      const handle = await startRecording({
        onLevel: (l) => {
          setLevel(l);
          onLevelChange?.(l);
        },
      });
      handleRef.current = handle;
      setRecording(true);
      onRecordingChange?.(true);
    } catch {
      setError(
        "Couldn't access the microphone. Check permissions, or type your answer instead."
      );
    }
  }, [disabled, recording, onLevelChange, onRecordingChange]);

  const handleStop = useCallback(async () => {
    const handle = handleRef.current;
    handleRef.current = null;
    if (!handle) return;
    setRecording(false);
    setLevel(0);
    onRecordingChange?.(false);
    onLevelChange?.(0);
    try {
      const { blob, mimeType } = await handle.stop();
      const audioBase64 = await blobToBase64(blob);
      onCaptured(audioBase64, mimeType);
    } catch {
      setError("Recording was too short or failed to capture. Try again.");
    }
  }, [onCaptured, onLevelChange, onRecordingChange]);

  const handleCancel = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setRecording(false);
    setLevel(0);
    onRecordingChange?.(false);
    onLevelChange?.(0);
  }, [onLevelChange, onRecordingChange]);

  const ringScale = reduceMotion ? 1 : 1 + level * 0.6;
  const ringOpacity = 0.15 + level * 0.55;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <motion.div
          aria-hidden
          animate={{
            scale: recording ? ringScale : 1,
            opacity: recording ? ringOpacity : 0,
          }}
          transition={{
            scale: { duration: 0, ease: "linear" },
            opacity: recording
              ? { duration: 0, ease: "linear" }
              : { duration: 0.15, ease: [0.4, 0, 1, 1] },
          }}
          className="absolute inset-0 rounded-full bg-accent"
        />
        <motion.button
          type="button"
          aria-pressed={recording}
          aria-label="Hold to talk"
          disabled={disabled}
          onPointerDown={handleStart}
          onPointerUp={handleStop}
          onPointerLeave={() => {
            if (recording) handleCancel();
          }}
          animate={{ scale: recording ? 0.96 : 1 }}
          transition={{
            duration: recording ? 0.2 : 0.15,
            ease: recording ? [0.16, 1, 0.3, 1] : [0.4, 0, 1, 1],
          }}
          className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border border-border-strong bg-surface text-accent shadow-float disabled:opacity-50"
        >
          <MicIcon />
        </motion.button>
      </div>
      <p className="text-sm text-text-secondary">
        {recording ? "Release to finish" : "Hold to talk"}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
