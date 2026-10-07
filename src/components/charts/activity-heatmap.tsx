import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

/** GitHub-style training heatmap: one cell per day, darker = more sets. */
export function ActivityHeatmap({
  perDay,
  weeks = 26,
  now = new Date(),
}: {
  perDay: Record<string, number>;
  weeks?: number;
  now?: Date;
}) {
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const offset = (today.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(today.getTime() - (offset + (weeks - 1) * 7) * DAY_MS);

  const max = Math.max(1, ...Object.values(perDay));
  const level = (n: number) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const shade = [
    "bg-muted",
    "bg-primary/25",
    "bg-primary/45",
    "bg-primary/70",
    "bg-primary",
  ];

  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
      const iso = date.toISOString().slice(0, 10);
      return { iso, future: date > today, n: perDay[iso] ?? 0 };
    })
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label="Training activity heatmap">
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((c) => (
              <div
                key={c.iso}
                title={`${c.iso}: ${c.n} set${c.n === 1 ? "" : "s"}`}
                className={cn(
                  "h-3.5 w-3.5 rounded-[3px] sm:h-4 sm:w-4",
                  c.future ? "bg-transparent" : shade[level(c.n)]
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        less
        {shade.map((s) => (
          <span key={s} className={cn("h-3 w-3 rounded-[3px]", s)} />
        ))}
        more
      </div>
    </div>
  );
}
