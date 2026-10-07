import { Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  MUSCLE_GROUPS,
  type MatrixCell,
  type MatrixRow,
  type ProgressMatrix as ProgressMatrixData,
} from "@/lib/training-analytics";

function splitName(name: string): { main: string; note: string | null } {
  const m = name.match(/^(.*?)\s*(\([^)]*\))\s*$/);
  return m ? { main: m[1], note: m[2] } : { main: name, note: null };
}

function stripeColor(row: MatrixRow): string {
  return `hsl(var(--chart-${(MUSCLE_GROUPS.indexOf(row.muscleGroup) % 5) + 1}))`;
}

function Cell({ cell, assisted }: { cell: MatrixCell | null; assisted: boolean }) {
  if (!cell) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 tabular-nums",
        cell.isPr
          ? "bg-gradient-to-r from-success/20 to-success/5 font-bold ring-1 ring-success/40"
          : "font-medium"
      )}
    >
      {cell.isPr && (
        <span
          aria-label="Personal record"
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-success shadow-[0_0_10px_2px_hsl(var(--success)/0.65)]"
        />
      )}
      <span>
        {formatNumber(cell.weightKg, 2)}
        <span className="text-xs font-medium text-muted-foreground"> kg × </span>
        {cell.reps}
      </span>
      {assisted && <span className="text-[11px] font-normal italic text-muted-foreground">assist</span>}
      {cell.improved === true && <span className="text-[11px] text-success">▲</span>}
      {cell.improved === false && <span className="text-[11px] text-magenta">▼</span>}
    </span>
  );
}

function Trend({ row }: { row: MatrixRow }) {
  const { kind, deltaKg, pct } = row.trend;
  if (kind === "baseline") {
    return (
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Baseline logged
      </span>
    );
  }
  if (kind === "flat") {
    return (
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        ● Holding steady
      </span>
    );
  }
  const up = kind === "up";
  return (
    <span
      className={cn(
        "inline-flex flex-col rounded-xl px-3 py-1.5 text-sm font-bold leading-tight tabular-nums",
        up
          ? "bg-gradient-to-br from-success/25 to-success/5 text-success"
          : "bg-magenta/10 text-magenta"
      )}
    >
      <span>
        {up ? "▲" : "▼"} {row.assisted ? (up ? "Less assist" : "More assist") : `${deltaKg > 0 ? "+" : ""}${formatNumber(deltaKg, 2)} kg`}
      </span>
      {pct !== null && !row.assisted && (
        <span className="text-xs font-semibold opacity-80">
          {pct > 0 ? "+" : ""}
          {pct}%
        </span>
      )}
      {row.assisted && (
        <span className="text-xs font-semibold opacity-80">
          {deltaKg > 0 ? "+" : ""}
          {formatNumber(deltaKg, 2)} kg
        </span>
      )}
    </span>
  );
}

/** Exercise × period table of best sets with PR glow and overall trend. */
export function ProgressMatrix({ matrix }: { matrix: ProgressMatrixData }) {
  if (matrix.rows.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">No sets in this window.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="bg-brand-gradient text-left text-white">
            <th className="sticky left-0 z-10 bg-brand-gradient px-4 py-3 text-xs font-semibold uppercase tracking-wide">
              Exercise
            </th>
            {matrix.columns.map((c) => (
              <th key={c.key} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {c.label}
                  {c.prs > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold">
                      <Trophy className="h-3 w-3" /> {c.prs}
                    </span>
                  )}
                </span>
              </th>
            ))}
            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">Overall trend</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const { main, note } = splitName(row.name);
            return (
              <tr
                key={row.exerciseId}
                className="group border-t transition-colors odd:bg-muted/20 hover:bg-primary/5"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-semibold group-odd:bg-muted/40 group-hover:bg-primary/5"
                  style={{ boxShadow: `inset 4px 0 0 ${stripeColor(row)}` }}
                >
                  <span className="block pl-1">
                    {main} {note && <span className="font-normal italic text-muted-foreground">{note}</span>}
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {row.muscleGroup}
                    </span>
                  </span>
                </th>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-3 py-2.5 align-middle">
                    <Cell cell={cell} assisted={row.assisted} />
                  </td>
                ))}
                <td className="px-3 py-2.5 align-middle">
                  <Trend row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="flex items-center gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" />
        Personal best in this window · best set per period (heaviest, then most reps)
      </p>
    </div>
  );
}
