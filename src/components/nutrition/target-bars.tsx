import { cn } from "@/lib/utils";
import type { TargetProgress } from "@/lib/nutrition-intel";

/** Progress bars against nutrition targets. Rows without data show a dash. */
export function TargetBars({ rows }: { rows: TargetProgress[] }) {
  const shown = rows.filter((r) => r.target !== null || r.current !== null);
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing logged today.</p>;
  return (
    <div className="space-y-3">
      {shown.map((r) => {
        const pct = r.pct === null ? 0 : Math.min(100, r.pct);
        const over = r.pct !== null && r.pct > 110 && (r.key === "calories" || r.key === "fat");
        return (
          <div key={r.key} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{r.current === null ? "—" : r.current.toLocaleString()}</span>
                {r.target !== null && ` / ${r.target.toLocaleString()}`} {r.unit}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", over ? "bg-magenta" : "bg-brand-gradient")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
