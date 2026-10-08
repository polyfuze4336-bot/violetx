"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import type { ExerciseSeries } from "@/lib/training-analytics";

type Metric = "maxWeightKg" | "e1rm";

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { isPr: boolean };
}

/** Per-exercise progression with a gold marker on every new weight PR. */
export function PrProgress({ series }: { series: ExerciseSeries[] }) {
  const gradId = useId().replace(/:/g, "");
  const choices = useMemo(() => series.slice(0, 8), [series]);
  const [selectedId, setSelectedId] = useState(choices[0]?.exerciseId);
  const [metric, setMetric] = useState<Metric>("maxWeightKg");

  const selected = choices.find((c) => c.exerciseId === selectedId) ?? choices[0];
  if (!selected) return null;

  // Assisted lifts: lower assistance is the record, there is no estimated 1RM,
  // and the axis is flipped so improvement does not look like decline.
  const assisted = selected.assisted;
  const activeMetric: Metric = assisted ? "maxWeightKg" : metric;
  const unit = assisted ? "kg assist" : "kg";

  let best = assisted ? Infinity : 0;
  const data = selected.points.map((p) => {
    const isPr = assisted ? p.maxWeightKg < best : p.maxWeightKg > best;
    best = assisted ? Math.min(best, p.maxWeightKg) : Math.max(best, p.maxWeightKg);
    return {
      label: formatShortDate(p.date),
      value: activeMetric === "maxWeightKg" ? p.maxWeightKg : p.e1rm,
      isPr: activeMetric === "maxWeightKg" && isPr,
    };
  });
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const gain = assisted ? first - last : last - first;
  const pct = first > 0 ? Math.round((gain / first) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c.exerciseId}
            type="button"
            onClick={() => setSelectedId(c.exerciseId)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              c.exerciseId === selected.exerciseId
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-4xl font-bold tabular-nums">
            {last}
            <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>
          </p>
          {data.length > 1 && (
            <p className={cn("text-sm font-semibold", pct >= 0 ? "text-success" : "text-magenta")}>
              {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
            </p>
          )}
        </div>
        {!assisted && (
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
          {(
            [
              ["maxWeightKg", "Top set"],
              ["e1rm", "Est. strength"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium",
                metric === key ? "bg-background shadow-sm" : "text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={44} className="fill-muted-foreground" domain={["auto", "auto"]} unit=" kg" reversed={assisted} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            formatter={(v) => [`${v} ${unit}`, assisted ? "Assistance" : metric === "maxWeightKg" ? "Top set" : "Est. strength"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={(props: DotProps) => {
              const { cx, cy, payload } = props;
              if (cx === undefined || cy === undefined) return <g />;
              return payload?.isPr ? (
                <circle cx={cx} cy={cy} r={6} fill="hsl(var(--chart-4))" stroke="white" strokeWidth={2} />
              ) : (
                <circle cx={cx} cy={cy} r={2.5} fill="hsl(var(--chart-1))" />
              );
            }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {assisted && (
        <p className="text-xs text-muted-foreground">Lower assistance = stronger. Axis flipped: higher on the chart means less assistance.</p>
      )}
      {activeMetric === "maxWeightKg" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[hsl(var(--chart-4))]" /> New PR
        </p>
      )}
    </div>
  );
}
