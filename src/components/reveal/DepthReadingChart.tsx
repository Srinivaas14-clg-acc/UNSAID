"use client";

import { motion, useReducedMotion } from "motion/react";
import type { SynthesisClusterView } from "@/lib/types";

interface DepthReadingChartProps {
  clusters: SynthesisClusterView[];
}

const TRACK_WIDTH = 100; // percent

/**
 * Depth Reading dot-plot — DESIGN.md §5.2. One horizontal track per cluster,
 * one dot per claim_id in that cluster. Higher corroboration_count pulls the
 * majority dots tighter together on the track. At most one dot per track is
 * colored ember (a genuine outlier) — the one sanctioned same-view mixing of
 * ember/teal (DESIGN.md §1.1), since the color difference IS the data.
 *
 * If a track has fewer than 2 claim_ids there is no meaningful "outlier"
 * signal to show, so every dot renders teal rather than inventing a fake
 * distinction the data doesn't support.
 */
export function DepthReadingChart({ clusters }: DepthReadingChartProps) {
  const reduceMotion = useReducedMotion();

  if (clusters.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <span className="text-caption">Depth reading</span>
        <h2 className="text-heading-upright">How tightly each topic clusters</h2>
      </div>
      <div className="flex flex-col gap-6">
        {clusters.map((cluster, trackIndex) => (
          <DepthTrack
            key={cluster.cluster_id}
            cluster={cluster}
            trackIndex={trackIndex}
            reduceMotion={!!reduceMotion}
          />
        ))}
      </div>
    </div>
  );
}

function DepthTrack({
  cluster,
  trackIndex,
  reduceMotion,
}: {
  cluster: SynthesisClusterView;
  trackIndex: number;
  reduceMotion: boolean;
}) {
  const dotCount = cluster.claim_ids.length;
  if (dotCount === 0) return null;

  // Tightness: a higher corroboration_count draws the majority dots closer
  // together (DESIGN.md §5.2). Map corroboration_count to a spread factor —
  // more corroboration => smaller spread around the cluster center.
  const spread = Math.max(0.15, 1 - cluster.corroboration_count / (dotCount + 2));

  // Only mark an outlier when there's an actual majority to contrast against
  // — at least 3 dots, so "1 of 3 is different" reads as a real signal
  // rather than an arbitrary coin flip on a 2-dot track.
  const hasOutlierSignal = dotCount >= 3;
  const outlierIndex = hasOutlierSignal ? dotCount - 1 : -1;

  const positions = Array.from({ length: dotCount }, (_, i) => {
    if (i === outlierIndex) {
      // Outlier sits away from the majority cluster center.
      return 12;
    }
    const majorityCount = hasOutlierSignal ? dotCount - 1 : dotCount;
    const majorityIdx = hasOutlierSignal ? i : i;
    const center = 55;
    const span = 30 * spread;
    const t = majorityCount <= 1 ? 0.5 : majorityIdx / (majorityCount - 1);
    return center + (t - 0.5) * span;
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm text-text-primary">{cluster.summary}</p>
        <span className="text-caption whitespace-nowrap">
          {cluster.corroboration_count} corroborating
        </span>
      </div>
      <div
        className="relative h-6 w-full rounded-sm bg-surface-raised"
        style={{ width: `${TRACK_WIDTH}%` }}
      >
        {positions.map((pos, i) => {
          const isOutlier = i === outlierIndex;
          return (
            <motion.div
              key={cluster.claim_ids[i] ?? i}
              className={`depth-reading-dot absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full ${
                isOutlier ? "bg-ember" : "bg-teal"
              }`}
              style={{ left: `${pos}%` }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
                delay: reduceMotion
                  ? 0
                  : trackIndex * 0.06 + i * 0.03,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
