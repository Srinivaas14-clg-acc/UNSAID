"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { ConsentLevel } from "@/lib/types";

const OPTIONS: { value: ConsentLevel; label: string; helper: string }[] = [
  {
    value: "share_freely",
    label: "Share freely",
    helper: "Your exact words may appear in the reveal.",
  },
  {
    value: "use_dont_quote",
    label: "Use, don't quote",
    helper: "Shapes the outcome, never shown as your words.",
  },
  {
    value: "ignore",
    label: "Ignore this",
    helper: "Discarded before anything is generated.",
  },
];

/**
 * DESIGN.md §5 "Consent-tap confirmation": tapped option scales to 1.04 and
 * fills with accent-tint briefly, then the whole row collapses/fades as the
 * flow advances. No checkmark bounce, no confetti.
 */
export function ConsentTap({
  onSelect,
  disabled,
}: {
  onSelect: (consent: ConsentLevel) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<ConsentLevel | null>(null);
  const [collapsing, setCollapsing] = useState(false);
  const reduceMotion = useReducedMotion();

  function handleTap(value: ConsentLevel) {
    if (disabled || selected) return;
    setSelected(value);
    window.setTimeout(() => {
      setCollapsing(true);
      window.setTimeout(() => onSelect(value), reduceMotion ? 0 : 200);
    }, 100);
  }

  return (
    <AnimatePresence>
      {!collapsing && (
        <motion.div
          exit={
            reduceMotion
              ? undefined
              : { opacity: 0, height: 0, marginTop: 0 }
          }
          transition={{ duration: 0.2, ease: [0.4, 0, 1, 1] }}
          className="flex flex-col gap-3"
        >
          <span className="text-caption">
            Before this moves on — how should this be used?
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {OPTIONS.map((opt) => (
              <motion.button
                key={opt.value}
                type="button"
                disabled={disabled || selected !== null}
                onClick={() => handleTap(opt.value)}
                animate={
                  selected === opt.value
                    ? {
                        scale: 1.04,
                        backgroundColor: "var(--color-accent-tint)",
                      }
                    : { scale: 1 }
                }
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition-colors duration-150 ${
                  selected === opt.value
                    ? "border-accent"
                    : "border-border hover:border-border-strong"
                } disabled:cursor-not-allowed`}
              >
                <span className="text-sm font-semibold text-text-primary">
                  {opt.label}
                </span>
                <span className="text-xs text-text-tertiary">
                  {opt.helper}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
