import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { EXTRACTED_CLAIM_RESPONSE_SCHEMA, ExtractedClaimListSchema } from "@/lib/gemini/schemas";
import type { ExtractedClaim } from "@/lib/types";

export interface ExtractorTurn {
  probe: string;
  transcript: string;
}

/**
 * One call per participant, isolated — never share context across
 * participants (MISSION §3: "one call per participant, in parallel, in
 * isolation"). Transcript in, structured JSON out, nothing else: no prose,
 * no summary, no recommendation.
 *
 * Returns null (never throws) when the call fails or the response fails zod
 * validation — the caller (synthesize route) treats a null result as "drop
 * this participant from this synthesis run", per API-CONTRACT.md §8 step 5.
 */
export async function extractClaims(
  participantId: string,
  turns: ExtractorTurn[]
): Promise<ExtractedClaim[] | null> {
  if (turns.length === 0) return [];

  let ai;
  try {
    ai = getGeminiClient();
  } catch {
    return null;
  }

  const transcriptBlock = turns
    .map((t, i) => `Turn ${i + 1} (${t.probe}): ${t.transcript}`)
    .join("\n\n");

  const prompt = [
    "Extract discrete claims from this participant's answers below.",
    "Each claim is one distinct opinion, concern, or fact the participant",
    "expressed. For each claim, output:",
    '- claim_id: a short stable slug for this claim, e.g. "budget-constraint"',
    "- claim: the claim itself, in the participant's own words as closely as possible",
    '- stance: "for", "against", "neutral", or null if not applicable',
    "- intensity: 1-5 how strongly the claim was expressed, or null",
    '- category: a short category tag (e.g. "risk", "constraint", "timeline"), or null',
    "- consent: exactly the consent level already associated with the answer",
    "  it came from — pass through, never invent.",
    "",
    "Do not add commentary, summary, or recommendation. Only the claims array.",
    "",
    "Participant's answers:",
    transcriptBlock,
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTED_CLAIM_RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const validated = ExtractedClaimListSchema.safeParse(
      Array.isArray(parsed)
        ? parsed.map((c) => ({ ...c, participant_id: participantId }))
        : parsed
    );

    if (!validated.success) {
      // Log server-side only — never surface schema/model internals to the
      // client (transcripts/claim content must never leak into an error
      // response, per MISSION §6). This is purely for operator diagnosis.
      console.error(
        `[extractClaims] schema validation failed for participant ${participantId}:`,
        validated.error.message
      );
      return null;
    }

    return validated.data;
  } catch (err) {
    console.error(
      `[extractClaims] Gemini call failed for participant ${participantId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
