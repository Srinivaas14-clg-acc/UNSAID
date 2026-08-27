import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  raised?: boolean;
};

/**
 * Base card primitive — thin border, no default shadow (DESIGN.md §4: shadow
 * is reserved for genuinely floating layers, cards in document flow get a
 * border only).
 */
export function Card({ raised = false, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-md border border-border ${
        raised ? "bg-surface-raised" : "bg-surface"
      } p-6 ${className}`}
      {...props}
    />
  );
}
