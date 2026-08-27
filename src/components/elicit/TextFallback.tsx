"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { FocusTextarea } from "@/components/ui/FocusInput";
import { Button } from "@/components/ui/Button";

export function TextFallback({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const reduceMotion = useReducedMotion();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-text-secondary underline decoration-border underline-offset-4 hover:text-text-primary"
      >
        Type instead
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3"
      >
        <FocusTextarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your answer…"
        />
        <div className="flex gap-3">
          <Button
            type="button"
            disabled={disabled || text.trim().length === 0}
            onClick={() => onSubmit(text.trim())}
          >
            Submit
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
