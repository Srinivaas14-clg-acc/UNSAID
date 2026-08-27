import type { Claim } from "@/lib/types";

/**
 * Pure, synchronous claim-grouping helper used by src/lib/aggregate/
 * aggregator.ts. Deliberately has NO import of src/lib/aggregate/cluster.ts
 * (which calls Gemini) — this keeps aggregator.ts's "zero network/LLM calls
 * inside this file" guarantee true transitively, not just for its own code.
 *
 * The synthesize route calls src/lib/aggregate/cluster.ts::suggestClusters
 * (async, may call Gemini) BEFORE calling aggregate(), then passes the
 * resulting suggestions in here. The k-threshold/consent/guard decision
 * logic itself lives entirely in aggregator.ts — this file only groups an
 * already-filtered claim list into arrays, using suggestions when given.
 */
export interface ClusterGroupLike {
  cluster_id: string;
  claim_ids: string[];
}

export function suggestClustersSync(
  claims: Claim[],
  clusterSuggestions?: ClusterGroupLike[]
): Claim[][] {
  if (!clusterSuggestions || clusterSuggestions.length === 0) {
    // Fallback: one cluster per distinct claim_id.
    const byClaimId = new Map<string, Claim[]>();
    for (const c of claims) {
      const arr = byClaimId.get(c.claim_id) ?? [];
      arr.push(c);
      byClaimId.set(c.claim_id, arr);
    }
    return Array.from(byClaimId.values());
  }

  const byClaimId = new Map<string, Claim[]>();
  for (const c of claims) {
    const arr = byClaimId.get(c.claim_id) ?? [];
    arr.push(c);
    byClaimId.set(c.claim_id, arr);
  }

  const clustered: Claim[][] = [];
  const consumed = new Set<string>();

  for (const suggestion of clusterSuggestions) {
    const members: Claim[] = [];
    for (const claimId of suggestion.claim_ids) {
      const rows = byClaimId.get(claimId);
      if (rows) {
        members.push(...rows);
        consumed.add(claimId);
      }
    }
    if (members.length > 0) clustered.push(members);
  }

  // Any claim_id not covered by a suggestion still gets its own cluster —
  // never silently drop a claim from clustering.
  for (const [claimId, rows] of byClaimId) {
    if (!consumed.has(claimId)) clustered.push(rows);
  }

  return clustered;
}
