import { getGeminiClient, GEMINI_MODEL } from "@/lib/gemini/client";
import { CLUSTER_SUGGESTION_RESPONSE_SCHEMA, ClusterSuggestionSchema } from "@/lib/gemini/schemas";
import type { Claim } from "@/lib/types";
import type { ClusterGroupLike } from "@/lib/aggregate/cluster-sync";

/**
 * Claim clustering — groups claims that express the same underlying point.
 * May call Gemini for grouping SUGGESTIONS only: sends claim text + category
 * only, NEVER transcripts, NEVER participant-identifying free text beyond
 * the opaque claim_id. Clustering never decides what surfaces — that
 * decision (k-threshold / consent / claim_id guard) lives entirely in
 * src/lib/aggregate/aggregator.ts.
 *
 * Falls back to a simple identity clustering (one cluster per claim_id) if
 * Gemini is unavailable or the call fails — the aggregator's rule
 * application still runs correctly on ungrouped input, it just won't merge
 * near-duplicate phrasings into one cluster.
 */
export type ClusterGroup = ClusterGroupLike;

export async function suggestClusters(claims: Claim[]): Promise<ClusterGroup[]> {
  if (claims.length === 0) return [];

  const fallback: ClusterGroup[] = claims.map((c) => ({
    cluster_id: c.claim_id,
    claim_ids: [c.claim_id],
  }));

  let ai;
  try {
    ai = getGeminiClient();
  } catch {
    return fallback;
  }

  // Only claim text + category, never transcripts, never anything beyond the
  // opaque claim_id that could identify a participant.
  const anonymizedClaims = claims.map((c) => ({
    claim_id: c.claim_id,
    claim: c.claim,
    category: c.category,
  }));

  const prompt = [
    "Group these claims into clusters where each cluster represents the same",
    "underlying point, even if phrased differently. Every claim_id must",
    "appear in exactly one cluster. Do not merge claims that express",
    "different points just because they share a category.",
    "",
    JSON.stringify(anonymizedClaims, null, 2),
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: CLUSTER_SUGGESTION_RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) return fallback;

    const parsed = JSON.parse(text);
    const validated = ClusterSuggestionSchema.safeParse(parsed);
    if (!validated.success) return fallback;

    // Guard: every input claim_id must appear somewhere in the suggestion,
    // otherwise fall back rather than risk dropping a claim from clustering.
    const allSuggested = new Set(validated.data.clusters.flatMap((c) => c.claim_ids));
    const allInput = new Set(claims.map((c) => c.claim_id));
    for (const id of allInput) {
      if (!allSuggested.has(id)) return fallback;
    }

    return validated.data.clusters;
  } catch {
    return fallback;
  }
}
