import { Card } from "@/components/ui/Card";

/**
 * First-class designed state for "No meaningful disagreement found"
 * (MISSION §3: "a real, correctly-rendered state. Build it properly.") —
 * not a fallback div, styled with the same weight as the panel it replaces.
 */
export function NoDisagreementState() {
  return (
    <Card className="flex flex-col gap-3 p-8">
      <span className="text-caption text-success">Where you disagree</span>
      <h2 className="text-heading-upright">No meaningful disagreement found</h2>
      <p className="max-w-[60ch] text-text-secondary">
        Across every answer that met the threshold, nothing surfaced as a
        genuine split. That is itself the finding — not a gap in the data.
      </p>
    </Card>
  );
}
