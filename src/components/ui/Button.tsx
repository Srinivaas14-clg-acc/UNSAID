"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";
type Accent = "ember" | "teal";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /**
   * Explicit ember/teal choice — DESIGN.md §7: Button intent must be legible
   * from props alone, not silently inherited from the ambient data-state
   * context. Defaults to "ember" when omitted (matches the private/
   * confessional default accent in globals.css).
   */
  accent?: Accent;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2";

const accentVariants: Record<Accent, Record<Variant, string>> = {
  ember: {
    primary:
      "bg-ember text-[#0A0B0D] hover:bg-ember-hover active:bg-ember-hover focus-visible:outline-ember",
    secondary:
      "bg-surface text-text-primary border border-border hover:border-ember focus-visible:outline-ember",
    ghost:
      "bg-transparent text-text-secondary hover:text-ember focus-visible:outline-ember",
  },
  teal: {
    primary:
      "bg-teal text-[#0A0B0D] hover:bg-teal-hover active:bg-teal-hover focus-visible:outline-teal",
    secondary:
      "bg-surface text-text-primary border border-border hover:border-teal focus-visible:outline-teal",
    ghost:
      "bg-transparent text-text-secondary hover:text-teal focus-visible:outline-teal",
  },
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      accent = "ember",
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={`${base} ${accentVariants[accent][variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
