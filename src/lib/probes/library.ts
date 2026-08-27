import { Type } from "@google/genai";
import type { ProbeId } from "@/lib/types";

/**
 * Canonical probe library — the single source of truth for probe ids,
 * question text, and function-declaration shape used by both
 * src/lib/gemini/moderator.ts (function calling) and any UI copy that wants
 * to show probe questions. src/lib/types.ts's `ProbeId` union must stay in
 * sync with the ids listed here.
 */

export interface ProbeDefinition {
  id: ProbeId;
  question: string;
  /** Description shown to the model so it knows when to pick this probe. */
  description: string;
}

// Fixed Q1 probes, keyed by session template. Q1 is never chosen by the
// model — MISSION §3: "Q1 is fixed by template."
export const TEMPLATE_Q1_QUESTION: Record<string, string> = {
  decision: "What's your honest take on this decision?",
  retro: "What actually happened, in your own words?",
  exit: "What's the real reason you're leaving?",
  stay: "What's the real reason you're staying?",
  pulse: "How are things, honestly, right now?",
  debrief: "What's your honest read on how this went?",
  policy_reaction: "What's your honest reaction to this policy?",
};

// The six adaptive probes (Q2/Q3 candidates) + end_early. Q1 is intentionally
// excluded — it is never chosen by the model.
export const PROBE_LIBRARY: ProbeDefinition[] = [
  {
    id: "probe_dealbreaker",
    question: "What would make you say no?",
    description:
      "Ask what would make the participant reject or oppose this outright — surfaces hard dealbreakers.",
  },
  {
    id: "probe_unspoken",
    question: "What haven't you said out loud?",
    description:
      "Ask what the participant is holding back or hasn't voiced yet — surfaces unspoken concerns.",
  },
  {
    id: "probe_confidence",
    question: "How strongly do you actually hold this?",
    description:
      "Ask how confident or certain the participant really is in their stated position — surfaces conviction level.",
  },
  {
    id: "probe_constraint",
    question: "Is anything outside this decision affecting your answer?",
    description:
      "Ask whether external factors (budget, timing, personal circumstances) are shaping the participant's answer — surfaces hidden constraints.",
  },
  {
    id: "probe_specific",
    question: 'You said it "felt off" — when exactly?',
    description:
      "Ask the participant to get concrete about a vague or general statement they made — surfaces specifics.",
  },
  {
    id: "end_early",
    question: "",
    description:
      "The participant's answer is already complete and further probing would not add anything. Stop asking questions.",
  },
];

export const PROBE_IDS: ProbeId[] = PROBE_LIBRARY.map((p) => p.id);

export function getProbeById(id: string): ProbeDefinition | undefined {
  return PROBE_LIBRARY.find((p) => p.id === id);
}

export function isValidProbeId(id: string): id is ProbeId {
  return PROBE_IDS.includes(id as ProbeId);
}

/**
 * Gemini function-declaration objects for the adaptive probes (excludes Q1,
 * which is template-fixed and never a model choice). One declaration per
 * probe including `end_early`, each with no parameters — the model just
 * picks a function name.
 */
export function buildProbeFunctionDeclarations() {
  return PROBE_LIBRARY.map((p) => ({
    name: p.id,
    description: p.description,
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  }));
}
