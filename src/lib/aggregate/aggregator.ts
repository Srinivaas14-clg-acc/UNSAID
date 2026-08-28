import type { AggregatorInput, AggregatorOutput, Claim, SynthesisClusterView } from "@/lib/types";
import { suggestClustersSync, type ClusterGroupLike } from "@/lib/aggregate/cluster-sync";

/**
 * PURE TypeScript. ZERO network/LLM calls inside this file.
 *
 * Implements the pseudocode from the approved plan
 * (C:\Users\sriva\.claude\plans\now-make-the-proj-lovely-pie.md) exactly:
 *
 *   const usable = allClaims.filter(c => c.consent !== "ignore");           // rule 3, defensive
 *   const grounded = usable.filter(c => realClaimIds.has(c.claim_id));      // rule 4, part 1
 *   const clusters = clusterClaims(grounded);
 *   for (const cluster of clusters) {
 *     const distinctParticipants = new Set(cluster.map(c => c.participant_id));
 *     const shareFreely = cluster.filter(c => c.consent === "share_freely");
 *     const shareFreelyParticipants = new Set(shareFreely.map(c => c.participant_id));
 *     const meetsK = distinctParticipants.size >= 2;
 *     const hasVerbatimQuorum = shareFreelyParticipants.size >= 2;
 *     if (meetsK && hasVerbatimQuorum) { render structurally }
 *     else if (meetsK) { use_dont_quote-only corroboration: shapes weighting, never rendered }
 *     else if (distinctParticipants.size === 1 && cluster[0].category === "constraint") { quietConstraintsCount += 1 }
 *   }
 *   // re-verify every claim_id in the final output traces to realClaimIds
 *
 * Each rule is implemented as a small, named, individually-testable pure
 * function below; `aggregate()` composes them.
 */

// --- Step 1: filter out ignored claims (rule 3, defensive) ------------------
// `synthesize/route.ts` already excludes `ignore` rows via the DB query
// predicate before extraction ever runs. This filter is a second,
// independent line of defense inside the pure aggregator itself, in case a
// caller ever passes an un-filtered claim list.
export function filterUsable(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.consent !== "ignore");
}

// --- Step 2: drop anything not traceable to a real claim_id (rule 4, part 1) -
export function filterGrounded(claims: Claim[], realClaimIds: Set<string>): Claim[] {
  return claims.filter((c) => realClaimIds.has(c.claim_id));
}

// --- Step 3: group claims into clusters --------------------------------------
// Delegates to a caller-supplied grouping (from src/lib/aggregate/cluster.ts,
// computed *before* calling aggregate() since that file may call Gemini).
// If no grouping is supplied, falls back to one cluster per distinct
// claim_id (still correct, just without cross-phrasing merges).
export function groupIntoClusters(
  claims: Claim[],
  clusterSuggestions?: ClusterGroupLike[]
): Claim[][] {
  return suggestClustersSync(claims, clusterSuggestions);
}

// --- Per-cluster helpers ------------------------------------------------------

export function distinctParticipantIds(cluster: Claim[]): Set<string> {
  return new Set(cluster.map((c) => c.participant_id));
}

export function shareFreelyClaims(cluster: Claim[]): Claim[] {
  return cluster.filter((c) => c.consent === "share_freely");
}

export function shareFreelyParticipantIds(cluster: Claim[]): Set<string> {
  return new Set(shareFreelyClaims(cluster).map((c) => c.participant_id));
}

/** Rule 1: k>=2 distinct participants required for a cluster to count at all. */
export function meetsK(cluster: Claim[], minParticipants: number): boolean {
  return distinctParticipantIds(cluster).size >= minParticipants;
}

/**
 * Rule 2: a second, independent k>=2 check restricted to share_freely
 * claims — verbatim quoting requires k>=2 distinct participants who
 * specifically consented to share_freely, not just k>=2 overall.
 */
export function hasVerbatimQuorum(cluster: Claim[], minParticipants: number): boolean {
  return shareFreelyParticipantIds(cluster).size >= minParticipants;
}

/**
 * Rule 6: a single-source claim whose category is "constraint" increments a
 * count only — never rendered as content. Only claims that fail meetsK (i.e.
 * genuinely single-participant, since minParticipants is always 2 in Batch
 * mode) can hit this branch.
 */
export function isQuietConstraint(cluster: Claim[]): boolean {
  const distinct = distinctParticipantIds(cluster);
  return distinct.size === 1 && cluster[0]?.category === "constraint";
}

// --- Rendering a cluster into the public SynthesisClusterView shape ---------
// Quotes are populated ONLY from share_freely claims (rule 2) — a cluster
// corroborated solely by use_dont_quote responses never reaches this
// function in the first place (see aggregate() below), but this function
// additionally never includes non-share_freely text even if called directly,
// as a second line of defense.
function renderCluster(
  clusterId: string,
  cluster: Claim[],
  summary: string
): SynthesisClusterView {
  const freely = shareFreelyClaims(cluster);
  const distinct = distinctParticipantIds(cluster);
  const claimIds = Array.from(new Set(cluster.map((c) => c.claim_id)));

  return {
    cluster_id: clusterId,
    summary,
    quotes: freely.map((c) => c.claim),
    corroboration_count: distinct.size,
    claim_ids: claimIds,
    category: cluster[0]?.category ?? null,
  };
}

/**
 * Structural framing text for a rendered cluster. Deliberately simple/
 * deterministic (no LLM call — this file has zero network calls) — the
 * synthesize route may separately ask Gemini for a nicer `recommendation`/
 * `reframe_question` text (src/lib/gemini/recommend.ts), grounded in this
 * already-filtered output, but the per-cluster `summary` here is pure TS.
 */
function structuralSummary(cluster: Claim[], totalParticipants: number): string {
  const distinct = distinctParticipantIds(cluster).size;
  if (totalParticipants > 0 && distinct >= totalParticipants) {
    return `Reads as unanimous (${distinct} of ${totalParticipants} participants).`;
  }
  return `Raised independently by ${distinct} participant${distinct === 1 ? "" : "s"}.`;
}

/**
 * Final guard (rule 4, part 2): re-verify every claim_id appearing in the
 * final output traces to realClaimIds. Anything that fails is silently
 * dropped, not shown with a caveat.
 */
export function reverifyClaimIds(
  views: SynthesisClusterView[],
  realClaimIds: Set<string>
): SynthesisClusterView[] {
  return views
    .map((v) => {
      const validIds = v.claim_ids.filter((id) => realClaimIds.has(id));
      if (validIds.length === 0) return null;
      return { ...v, claim_ids: validIds };
    })
    .filter((v): v is SynthesisClusterView => v !== null);
}

/**
 * Splits clusters into agreement vs disagreement.
 *
 * A cluster is "disagreement" only when two DISTINCT PARTICIPANTS assert
 * conflicting stances on the same claim (e.g. one "for", another "against").
 * It is deliberately NOT based on raw stance-string diversity within the
 * cluster: extraction runs once per participant in isolation (MISSION §3),
 * so the model may tag the same underlying claim "against" for one
 * participant and null/"neutral" for another purely as extraction noise,
 * even when both participants are describing the identical fact and neither
 * contradicts the other. Grouping by participant first, then checking for
 * genuinely opposed pairs, avoids misclassifying that noise as disagreement.
 * No LLM call — pure structural check.
 */
function classifyAgreementOrDisagreement(cluster: Claim[]): "agreement" | "disagreement" {
  const stanceByParticipant = new Map<string, Set<string>>();
  for (const c of cluster) {
    if (!c.stance) continue;
    const set = stanceByParticipant.get(c.participant_id) ?? new Set<string>();
    set.add(c.stance);
    stanceByParticipant.set(c.participant_id, set);
  }

  const distinctStances = new Set<string>();
  for (const set of stanceByParticipant.values()) {
    for (const s of set) distinctStances.add(s);
  }

  // Only "for" vs "against" is a genuine disagreement. "neutral" alongside
  // either is not a conflict — it means that participant didn't take a side,
  // not that they oppose the other's position.
  const hasFor = distinctStances.has("for");
  const hasAgainst = distinctStances.has("against");
  return hasFor && hasAgainst ? "disagreement" : "agreement";
}

/**
 * Pure aggregation entry point. No network/LLM calls inside this function or
 * anywhere in this file.
 */
export function aggregate(input: AggregatorInput, clusterSuggestions?: ClusterGroupLike[]): AggregatorOutput {
  const { claims: allClaims, realClaimIds, minParticipants } = input;

  const usable = filterUsable(allClaims); // rule 3, defensive
  const grounded = filterGrounded(usable, realClaimIds); // rule 4, part 1
  const clusters = groupIntoClusters(grounded, clusterSuggestions);

  const totalParticipants = distinctParticipantIds(grounded).size;

  const agreementViews: SynthesisClusterView[] = [];
  const disagreementViews: SynthesisClusterView[] = [];
  let quietConstraintsCount = 0;

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;

    const clusterMeetsK = meetsK(cluster, minParticipants);
    const clusterHasVerbatimQuorum = hasVerbatimQuorum(cluster, minParticipants);
    const clusterId = cluster[0].claim_id;

    if (clusterMeetsK && clusterHasVerbatimQuorum) {
      // Render structurally (agreement or disagreement), using only
      // share_freely text for quotes.
      const summary = structuralSummary(cluster, totalParticipants);
      const view = renderCluster(clusterId, cluster, summary);
      const kind = classifyAgreementOrDisagreement(cluster);
      if (kind === "agreement") agreementViews.push(view);
      else disagreementViews.push(view);
    } else if (clusterMeetsK) {
      // meetsK but not hasVerbatimQuorum: use_dont_quote-only corroboration.
      // Rule 2 — shapes weighting only, never rendered as content. No-op here
      // by design (nothing pushed to agreement/disagreement/quotes).
    } else if (isQuietConstraint(cluster)) {
      // Rule 6 — count only, never content.
      quietConstraintsCount += 1;
    }
    // Any other single-source, non-constraint cluster: below threshold,
    // not a constraint — silently dropped, per rule 4's "unmapped output is
    // discarded before render, not shown with a caveat" spirit.
  }

  // Rule 4, part 2: re-verify every claim_id in the final output traces to
  // realClaimIds; anything that fails is silently discarded.
  const finalAgreement = reverifyClaimIds(agreementViews, realClaimIds);
  const finalDisagreement = reverifyClaimIds(disagreementViews, realClaimIds);

  return {
    agreement: finalAgreement,
    disagreement: finalDisagreement,
    quiet_constraints_count: quietConstraintsCount,
    no_disagreement_found: finalDisagreement.length === 0,
  };
}
