"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

interface AmbientWaveProps {
  /** Live RMS level, 0..1. Direct amplitude map, no easing — DESIGN.md §5.1. */
  level: number;
  recording: boolean;
  width?: number;
  height?: number;
}

const POINTS = 48;

/**
 * Ambient sine wave for the private/confessional talk screen (DESIGN.md
 * §5.1). Amplitude is a direct map from the live mic RMS level passed in via
 * VoiceRecorder's onLevel callback — no interpolation, no idle loop. Flat
 * line when not recording or level is 0.
 *
 * Under prefers-reduced-motion, degrades to an opacity-only response
 * (amplitude maps to stroke opacity instead of wave height) per DESIGN.md
 * §5.3 — same treatment as the level ring's reduced-motion carve-out.
 */
export function AmbientWave({
  level,
  recording,
  width = 320,
  height = 64,
}: AmbientWaveProps) {
  const reduceMotion = useReducedMotion();
  // Small phase increment per frame while recording — purely cosmetic
  // horizontal travel of the same amplitude-driven wave, not an
  // independent decorative animation: it only advances while `recording`
  // is true and freezes the instant it stops, matching the "no motion
  // without a live signal" rule.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!recording || reduceMotion) return;
    let rafId: number;
    const tick = () => {
      setPhase((p) => p + 0.15);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [recording, reduceMotion]);

  const amplitude = recording ? level : 0;
  const midY = height / 2;
  const maxAmplitude = height / 2 - 4;

  const path = Array.from({ length: POINTS + 1 }, (_, i) => {
    const x = (i / POINTS) * width;
    const t = (i / POINTS) * Math.PI * 4 + phase;
    const heightFactor = reduceMotion ? 0 : amplitude * maxAmplitude;
    const y = midY + Math.sin(t) * heightFactor;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  // Reduced motion: flat line, opacity carries the amplitude signal instead
  // of wave height (DESIGN.md §5.3).
  const flatPath = `M0,${midY} L${width},${midY}`;
  const strokeOpacity = reduceMotion
    ? 0.25 + amplitude * 0.75
    : 0.5 + amplitude * 0.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="ambient-wave"
    >
      <path
        d={reduceMotion ? flatPath : path}
        fill="none"
        stroke="var(--color-ember)"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ opacity: strokeOpacity }}
      />
    </svg>
  );
}
