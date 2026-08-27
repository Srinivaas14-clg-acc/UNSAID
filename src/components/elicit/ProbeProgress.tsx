/**
 * Simple linear progress indicator for the 3-question cap. Purely visual —
 * the actual cap is enforced server-side (per API-CONTRACT.md §4/§5).
 */
export function ProbeProgress({
  current,
  total = 3,
}: {
  current: number;
  total?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-sm ${
            i < current ? "bg-accent" : "bg-border"
          }`}
        />
      ))}
      <span className="ml-2 text-caption whitespace-nowrap">
        {current} / {total}
      </span>
    </div>
  );
}
