"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/Button";

const CODE_LENGTH = 4;

/**
 * Raycast-style single-focus join-code entry. Uppercases and strips
 * disallowed characters as the user types; navigates to /s/[code] on submit.
 */
export function JoinCodeInput() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    router.push(`/s/${code}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        className="rounded-md border bg-surface"
      >
        <input
          autoFocus
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, CODE_LENGTH)
            )
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="CODE"
          aria-label="Session join code"
          className="w-full bg-transparent px-5 py-4 text-center outline-none placeholder:text-text-tertiary text-mono-lg"
        />
      </motion.div>
      <Button type="submit" size="lg" disabled={code.length !== CODE_LENGTH}>
        Join session
      </Button>
    </form>
  );
}
