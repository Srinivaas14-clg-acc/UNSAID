import { Card } from "@/components/ui/Card";

/**
 * Count only, zero expandable affordance (MISSION §6 rule 6: counts, never
 * content, for protected material). Deliberately no click/expand/tooltip
 * that would reveal what the constraints are.
 */
export function QuietConstraintsPanel({ count }: { count: number }) {
  return (
    <Card className="flex flex-col gap-3 p-8">
      <span className="text-caption">Shaping this quietly</span>
      <p className="text-mono-lg text-text-primary">{count}</p>
      <p className="max-w-[55ch] text-text-secondary">
        {count === 1
          ? "1 unstated constraint is factored into the recommendation below."
          : `${count} unstated constraints are factored into the recommendation below.`}
      </p>
    </Card>
  );
}
