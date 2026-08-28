import { Card } from "@/components/ui/Card";
import type { SynthesisClusterView } from "@/lib/types";

export function AgreementPanel({
  clusters,
}: {
  clusters: SynthesisClusterView[];
}) {
  return (
    <Card className="flex flex-col gap-5 p-8">
      <div className="flex flex-col gap-1">
        <span className="text-caption text-success">Where you agree</span>
        <h2 className="text-heading-upright">What actually holds up</h2>
      </div>
      {clusters.length === 0 ? (
        <p className="text-text-secondary">
          No clusters cleared the agreement threshold this round.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {clusters.map((cluster) => (
            <li key={cluster.cluster_id} className="flex flex-col gap-2">
              <p className="text-body-emphasis text-text-primary">
                {cluster.summary}
              </p>
              {cluster.quotes.length > 0 && (
                <ul className="flex flex-col gap-1.5 border-l border-border pl-4">
                  {cluster.quotes.map((quote, i) => (
                    <li
                      key={i}
                      className="text-sm italic text-text-secondary"
                    >
                      &ldquo;{quote}&rdquo;
                    </li>
                  ))}
                </ul>
              )}
              <span className="text-caption">
                {cluster.corroboration_count} people independently
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
