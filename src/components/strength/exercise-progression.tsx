"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDelta,
  formatNumber,
  formatShortDate,
} from "@/lib/format";
import { computeSeriesStats } from "@/lib/analytics";
import type {
  ExerciseSetRow,
  ProgressionPoint,
} from "@/lib/services/exerciseDetail";

type Mode = "WEIGHT" | "REPS" | "EST" | "HISTORY";

const MODES: { key: Mode; label: string }[] = [
  { key: "WEIGHT", label: "Max weight" },
  { key: "REPS", label: "Max reps" },
  { key: "EST", label: "Estimated strength" },
  { key: "HISTORY", label: "History" },
];

// Assisted lifts: the weight is assistance, and estimated strength is not computed.
const ASSISTED_MODES: { key: Mode; label: string }[] = [
  { key: "WEIGHT", label: "Assistance" },
  { key: "REPS", label: "Max reps" },
  { key: "HISTORY", label: "History" },
];

const METRIC: Record<
  Exclude<Mode, "HISTORY">,
  { pick: (p: ProgressionPoint) => number; unit: string; color: number }
> = {
  WEIGHT: { pick: (p) => p.topWeight, unit: "kg", color: 1 },
  REPS: { pick: (p) => p.maxReps, unit: "reps", color: 2 },
  EST: { pick: (p) => p.estStrength, unit: "kg", color: 3 },
};

function trailingPlateau(values: number[]): number {
  if (values.length === 0) return 0;
  const last = values[values.length - 1];
  let n = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] === last) n++;
    else break;
  }
  return n;
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: { date: string; value: number; delta: number | null } }>;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{formatDate(p.date)}</p>
      <p className="text-sm font-semibold tabular-nums">
        {formatNumber(p.value)} {unit}
      </p>
      {p.delta !== null && p.delta !== 0 && (
        <p className="tabular-nums text-muted-foreground">
          {formatDelta(p.delta)} {unit} vs previous
        </p>
      )}
    </div>
  );
}

export function ExerciseProgression({
  progression,
  history,
  assisted = false,
}: {
  progression: ProgressionPoint[];
  history: ExerciseSetRow[];
  assisted?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("WEIGHT");
  const modes = assisted ? ASSISTED_MODES : MODES;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Progress
          </div>
          <div className="flex flex-wrap gap-1">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === m.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {mode === "HISTORY" ? (
          <HistoryTable history={history} assisted={assisted} />
        ) : (
          <MetricChart mode={mode} progression={progression} assisted={assisted} />
        )}
      </CardContent>
    </Card>
  );
}

function MetricChart({
  mode,
  progression,
  assisted,
}: {
  mode: Exclude<Mode, "HISTORY">;
  progression: ProgressionPoint[];
  assisted: boolean;
}) {
  const { pick, color } = METRIC[mode];
  // Assisted weight is assistance: lower is better, so it is labelled and the
  // axis is flipped to keep improvement from looking like decline.
  const assistance = assisted && mode === "WEIGHT";
  const unit = assistance ? "kg assistance" : METRIC[mode].unit;
  const values = progression.map(pick);
  const stats = computeSeriesStats(
    progression.map((p) => ({ date: p.date, value: pick(p) }))
  );
  const data = progression.map((p, i) => ({
    date: p.date,
    label: formatShortDate(p.date),
    value: pick(p),
    delta: i > 0 ? pick(progression[i - 1]) : null,
  }));
  // Convert previous value into a delta.
  for (let i = 0; i < data.length; i++) {
    data[i].delta = i > 0 ? data[i].value - (data[i - 1].value as number) : null;
  }

  const plateau = trailingPlateau(values);
  const improving = stats ? (assistance ? stats.deltaStart < 0 : stats.deltaStart > 0) : false;
  const declining = stats ? (assistance ? stats.deltaStart > 0 : stats.deltaStart < 0) : false;

  if (progression.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No sessions recorded yet.
      </p>
    );
  }

  if (progression.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-4xl font-bold tabular-nums">
          {formatNumber(data[0].value)} {unit}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          One session so far — add another to see progression.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats && stats.count > 1 && (
        <div className="flex items-center gap-2">
          {stats.deltaStart === 0 ? (
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          ) : stats.deltaStart > 0 ? (
            <ArrowUpRight className={cn("h-4 w-4", improving ? "text-success" : "text-magenta")} />
          ) : (
            <ArrowDownRight className={cn("h-4 w-4", improving ? "text-success" : "text-magenta")} />
          )}
          <span
            className={cn(
              "text-lg font-bold tabular-nums",
              improving && "text-success",
              declining && "text-magenta"
            )}
          >
            {formatDelta(stats.deltaStart)} {unit}
          </span>
          {stats.pctStart !== null && (
            <span className="text-sm font-medium text-muted-foreground">
              ({formatDelta(stats.pctStart)}%) since starting
            </span>
          )}
          {assistance && improving && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              Strength ↑ Improving
            </span>
          )}
          {assistance && declining && (
            <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-xs font-semibold text-magenta">
              More assistance
            </span>
          )}
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient
              id={`ex-grad-${color}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={`hsl(var(--chart-${color}))`}
                stopOpacity={0.22}
              />
              <stop
                offset="100%"
                stopColor={`hsl(var(--chart-${color}))`}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-muted"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            width={40}
            className="fill-muted-foreground"
            domain={["auto", "auto"]}
            reversed={assistance}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} />}
            cursor={{ stroke: "hsl(var(--border))" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={`hsl(var(--chart-${color}))`}
            strokeWidth={2.5}
            fill={`url(#ex-grad-${color})`}
            dot={{ r: 2.5 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {assistance && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Lower assistance = stronger. The axis is flipped: higher on the chart means less assistance.
        </p>
      )}

      {plateau >= 3 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          {mode === "REPS" ? "Reps" : mode === "EST" ? "Estimated strength" : assistance ? "Assistance" : "Weight"}{" "}
          unchanged for {plateau} sessions.
        </div>
      )}
    </div>
  );
}

function HistoryTable({ history, assisted }: { history: ExerciseSetRow[]; assisted: boolean }) {
  const rows = [...history].reverse();
  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No sessions recorded yet.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Reps × Weight</TableHead>
          {!assisted && <TableHead>Est. strength</TableHead>}
          <TableHead>Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{formatDate(r.date)}</TableCell>
            <TableCell className="font-medium tabular-nums">
              {r.reps} × {r.weightKg} kg{assisted ? " assistance" : ""}
            </TableCell>
            {!assisted && (
              <TableCell className="tabular-nums text-muted-foreground">
                {r.estStrength} kg
              </TableCell>
            )}
            <TableCell className="text-xs text-muted-foreground">
              {r.source === "WHATSAPP" ? "WhatsApp" : "Manual"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
