import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { RECOMMENDATION_RESPONSE_SCHEMA, RecommendationOutputSchema } from "@/lib/gemini/schemas";
import type { AggregatorOutput } from "@/lib/types";

/**
 * Produces `recommendation` and `reframe_question` text, grounded ONLY in
 * the already-rule-filtered AggregatorOutput (synthesize step 11) — never
 * given raw transcripts or ungated claims. Isolated call, separate from
 * extraction/clustering.
 *
 * Returns null on failure — synthesize route falls back to null
 * recommendation/reframe_question fields rather than blocking the whole
 * synthesis on this cosmetic step.
 */
export async function generateRecommendation(
  question: string,
  output: AggregatorOutput
): Promise<{ recommendation: string; reframe_question: string } | null> {
  let ai;
  try {
    ai = getGeminiClient();
  } catch {
    return null;
  }

  const summary = {
    original_question: question,
    agreement: output.agreement.map((c) => ({
      summary: c.summary,
      quotes: c.quotes,
      corroboration_count: c.corroboration_count,
      category: c.category,
    })),
    disagreement: output.disagreement.map((c) => ({
      summary: c.summary,
      quotes: c.quotes,
      corroboration_count: c.corroboration_count,
      category: c.category,
    })),
    quiet_constraints_count: output.quiet_constraints_count,
    no_disagreement_found: output.no_disagreement_found,
  };

  const prompt = [
    "Based only on the structured synthesis below (already rule-filtered —",
    "do not add anything not present here), write:",
    "- recommendation: one clear recommended option/path, with the reasoning",
    "  that cleared the threshold. Do not name or identify any individual.",
    "- reframe_question: the question the group should actually be asking",
    "  instead, if the framing of the original question was off. If the",
    "  original framing was fine, reframe it as a sharper version of the same",
    "  question.",
    "",
    "Never mention counts of constraints as anything other than a number —",
    "never describe their content.",
    "",
    JSON.stringify(summary, null, 2),
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RECOMMENDATION_RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const validated = RecommendationOutputSchema.safeParse(parsed);
    if (!validated.success) return null;

    return validated.data;
  } catch {
    return null;
  }
}
