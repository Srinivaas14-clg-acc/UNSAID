import { FunctionCallingConfigMode } from "@google/genai";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { buildProbeFunctionDeclarations, isValidProbeId, getProbeById } from "@/lib/probes/library";
import type { ModeratorDecision } from "@/lib/types";

export interface ModeratorTurn {
  probe: string; // probe_id asked
  transcript: string; // the participant's answer
}

/**
 * Calls the moderator model with the transcript-so-far via function calling,
 * constrained to the probe library enum (excludes the template-fixed Q1).
 *
 * Fails closed to `end_early` on:
 *  - any API/network error,
 *  - a missing/unparseable function call,
 *  - a function name outside the fixed enum.
 * This is deliberate per MISSION §6 rule 11 / API-CONTRACT.md §4 — a failed
 * or ambiguous moderator call must never block a participant from finishing,
 * and must never let the model invent an unlisted probe.
 */
export async function decideNextProbe(
  question: string,
  turnsSoFar: ModeratorTurn[]
): Promise<ModeratorDecision> {
  let ai;
  try {
    ai = getGeminiClient();
  } catch {
    // Not configured — caller (route) is responsible for distinguishing
    // "not configured" from "fail closed"; this function only fails closed
    // for actual call failures. Re-throw so the route can return 503 when
    // this is the very first Gemini-dependent step.
    throw new Error("not_configured");
  }

  const transcriptSummary = turnsSoFar
    .map((t, i) => `Turn ${i + 1} (${t.probe}): ${t.transcript}`)
    .join("\n\n");

  const systemInstruction = [
    "You are a moderator deciding the next follow-up question in a short,",
    "anonymous elicitation session. The original question was:",
    `"${question}"`,
    "",
    "You must call exactly one function from the provided list to choose the",
    "next probe, or call end_early if the participant's answer is already",
    "complete and further probing would not add anything.",
    "Never invent a function that isn't provided.",
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemInstruction}\n\nConversation so far:\n${transcriptSummary || "(no answers yet)"}`,
            },
          ],
        },
      ],
      config: {
        tools: [{ functionDeclarations: buildProbeFunctionDeclarations() }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
          },
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const call = parts.find((p) => p.functionCall)?.functionCall;
    const name = call?.name;

    if (!name || !isValidProbeId(name)) {
      // Unexpected/unparseable function name — fail closed, never guess.
      return { probe_id: "end_early" };
    }

    if (name === "end_early") {
      return { probe_id: "end_early" };
    }

    const probe = getProbeById(name);
    if (!probe) {
      return { probe_id: "end_early" };
    }

    return { probe_id: probe.id, question: probe.question };
  } catch {
    // Any API error (network, upstream failure, malformed response) fails
    // closed to end_early at the application layer — a failed moderator
    // call must not block the participant from finishing.
    return { probe_id: "end_early" };
  }
}
