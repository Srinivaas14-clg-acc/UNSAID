"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Raycast-style single-focus input. DESIGN.md §7: "the single highest-
 * visibility taste surface in the app" — one focused input, generous
 * padding, instant focus-ring transition, nothing else competing.
 */

type FocusInputProps = InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
};

export const FocusInput = forwardRef<HTMLInputElement, FocusInputProps>(
  ({ mono = false, className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full rounded-md border border-border bg-surface px-5 py-4 text-lg text-text-primary outline-none placeholder:text-text-tertiary transition-colors duration-150 ease-[var(--ease-entrance)] focus:border-focus-ring ${
          mono ? "font-mono" : "font-sans"
        } ${className}`}
        {...props}
      />
    );
  }
);
FocusInput.displayName = "FocusInput";

type FocusTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const FocusTextarea = forwardRef<HTMLTextAreaElement, FocusTextareaProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full resize-none rounded-md border border-border bg-surface px-5 py-4 text-lg leading-relaxed text-text-primary outline-none placeholder:text-text-tertiary transition-colors duration-150 focus:border-focus-ring ${className}`}
        {...props}
      />
    );
  }
);
FocusTextarea.displayName = "FocusTextarea";

/**
 * Animated focus wrapper for the join-code style input — border-color/
 * box-shadow only transition per DESIGN.md's named motion moment
 * ("Join-code input focus": 150ms ease-out, border-color + box-shadow only,
 * no scale/glow).
 */
export function FocusRing({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={{
        borderColor: focused
          ? "var(--color-focus-ring)"
          : "var(--color-border)",
        boxShadow: focused
          ? "0 0 0 2px var(--color-focus-ring)"
          : "0 0 0 0px transparent",
      }}
      transition={{
        duration: reduceMotion ? 0 : 0.15,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="rounded-md border"
    >
      {children}
    </motion.div>
  );
}
