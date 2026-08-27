import { Card } from "@/components/ui/Card";

export function RecommendationPanel({
  recommendation,
  reframeQuestion,
}: {
  recommendation: string | null;
  reframeQuestion: string | null;
}) {
  return (
    <Card className="flex flex-col gap-6 border-border-strong p-8">
      <div className="flex flex-col gap-2">
        <span className="text-caption text-accent">Recommendation</span>
        <p className="text-body text-text-primary">
          {recommendation ?? "No recommendation was generated for this round."}
        </p>
      </div>
      {reframeQuestion && (
        <div className="flex flex-col gap-2 border-t border-border pt-6">
          <span className="text-caption">
            The question you should be asking instead
          </span>
          <p className="text-body text-text-primary">{reframeQuestion}</p>
        </div>
      )}
    </Card>
  );
}
