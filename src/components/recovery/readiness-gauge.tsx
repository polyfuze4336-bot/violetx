import { cn } from "@/lib/utils";
import type { Readiness } from "@/lib/readiness";

const LABEL_COLOR: Record<Readiness["label"], string> = {
  Excellent: "text-success",
  Good: "text-success",
  Moderate: "text-amber-600 dark:text-amber-400",
  Low: "text-magenta",
};

const BAR: Record<string, string> = {
  sleep: "Sleep",
  energy: "Energy",
  soreness: "Soreness",
  stress: "Stress",
};

/** Readiness gauge with component bars. Higher is always better. */
export function ReadinessGauge({ readiness, compact = false }: { readiness: Readiness; compact?: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("flex items-center gap-5", compact && "gap-4")}>
      <div className={cn("relative shrink-0", compact ? "h-24 w-24" : "h-32 w-32")}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * readiness.score) / 100}
            className="stroke-primary"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold tabular-nums", compact ? "text-3xl" : "text-4xl")}>{readiness.score}</span>
          <span className={cn("text-xs font-semibold", LABEL_COLOR[readiness.label])}>{readiness.label}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {Object.entries(BAR).map(([key, label]) => {
          const v = readiness.components[key as keyof Readiness["components"]];
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">{label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
              </div>
              <span className="w-7 text-right font-semibold tabular-nums">{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
