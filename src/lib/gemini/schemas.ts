import { z } from "zod";
import { PROBE_IDS } from "@/lib/probes/library";

/**
 * Zod schemas per docs/API-CONTRACT.md and MISSION §3's claim JSON shape.
 * These validate anything that crosses a Gemini call boundary — never trust
 * model output without running it through one of these first.
 */

export const ConsentLevelSchema = z.enum(["share_freely", "use_dont_quote", "ignore"]);

export const ProbeIdSchema = z.enum(PROBE_IDS as [string, ...string[]]);

// --- Extractor output (MISSION §3) ------------------------------------------

export const ExtractedClaimSchema = z.object({
  claim_id: z.string().min(1),
  participant_id: z.string().min(1),
  claim: z.string().min(1),
  stance: z.string().nullable(),
  intensity: z.number().min(1).max(5).nullable(),
  category: z.string().nullable(),
  consent: ConsentLevelSchema,
});

export const ExtractedClaimListSchema = z.array(ExtractedClaimSchema);

export type ExtractedClaimParsed = z.infer<typeof ExtractedClaimSchema>;

// The JSON schema Gemini's responseSchema config understands (OpenAPI 3.0
// subset — see @google/genai's Schema type). Kept separate from the zod
// schema above: this is what we ask the model to produce; the zod schema is
// what we validate the result against on receipt.
export const EXTRACTED_CLAIM_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      claim_id: { type: "STRING" },
      claim: { type: "STRING" },
      stance: { type: "STRING", nullable: true },
      intensity: { type: "INTEGER", nullable: true },
      category: { type: "STRING", nullable: true },
      consent: {
        type: "STRING",
        enum: ["share_freely", "use_dont_quote", "ignore"],
      },
    },
    required: ["claim_id", "claim", "consent"],
  },
} as const;

// --- Moderator function-call args -------------------------------------------

// The probes are declared as zero-arg functions (see
// buildProbeFunctionDeclarations) — the "args" schema is just the function
// name validated against the fixed enum, no parameters to parse.
export const ModeratorFunctionNameSchema = ProbeIdSchema;

// --- Aggregator input claim (re-exported here for convenience; the shape
// itself lives in src/lib/types.ts as `Claim` / `AggregatorInput`) ----------

export const ClaimRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  participant_id: z.string(),
  claim_id: z.string(),
  claim: z.string(),
  stance: z.string().nullable(),
  intensity: z.number().nullable(),
  category: z.string().nullable(),
  consent: ConsentLevelSchema,
  created_at: z.string(),
});

// --- Recommendation/reframe output (synthesize step 11) --------------------

export const RecommendationOutputSchema = z.object({
  recommendation: z.string().min(1),
  reframe_question: z.string().min(1),
});

export const RECOMMENDATION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recommendation: { type: "STRING" },
    reframe_question: { type: "STRING" },
  },
  required: ["recommendation", "reframe_question"],
} as const;

// --- Cluster grouping suggestion output (cluster.ts) ------------------------

export const ClusterSuggestionSchema = z.object({
  clusters: z.array(
    z.object({
      cluster_id: z.string().min(1),
      claim_ids: z.array(z.string().min(1)).min(1),
    })
  ),
});

export const CLUSTER_SUGGESTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    clusters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          cluster_id: { type: "STRING" },
          claim_ids: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["cluster_id", "claim_ids"],
      },
    },
  },
  required: ["clusters"],
} as const;
