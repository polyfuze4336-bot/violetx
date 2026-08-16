"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatNumber, formatShortDate, formatDate, formatDelta } from "@/lib/format";
import {
  computeSeriesStats,
  filterPointsByRange,
  type RangeKey,
  type SeriesPoint,
} from "@/lib/analytics";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "All" },
];

interface ChartPoint {
  date: string;
  label: string;
  value: number;
  deltaPrev: number | null;
}

function CustomTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
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
      {p.deltaPrev !== null && (
        <p
          className={cn(
            "tabular-nums",
            p.deltaPrev < 0 && "text-success",
            p.deltaPrev > 0 && "text-magenta",
            p.deltaPrev === 0 && "text-muted-foreground"
          )}
        >
          {formatDelta(p.deltaPrev)} {unit} vs previous
        </p>
      )}
    </div>
  );
}

export function TrendChartCard({
  title,
  points,
  unit,
  color = 1,
  goalLowerIsBetter = false,
  defaultRange = "ALL",
}: {
  title: string;
  points: SeriesPoint[];
  unit: string;
  color?: number;
  /** When true, a decrease is treated as improvement (e.g. waist, weight). */
  goalLowerIsBetter?: boolean;
  defaultRange?: RangeKey;
}) {
  const [range, setRange] = useState<RangeKey>(defaultRange);
  const filtered = filterPointsByRange(points, range);
  const stats = computeSeriesStats(filtered);

  const chartData: ChartPoint[] = filtered.map((p, i) => ({
    date: p.date,
    label: formatShortDate(p.date),
    value: p.value,
    deltaPrev: i > 0 ? p.value - filtered[i - 1].value : null,
  }));

  const improved = stats
    ? goalLowerIsBetter
      ? stats.deltaStart < 0
      : stats.deltaStart > 0
    : false;
  const TrendIcon =
    !stats || stats.deltaStart === 0
      ? ArrowRight
      : stats.deltaStart < 0
      ? ArrowDownRight
      : ArrowUpRight;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              {title}
            </h3>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight tabular-nums">
                {stats ? formatNumber(stats.latest) : "—"}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {unit}
              </span>
            </div>
            {stats && stats.count > 1 && (
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-sm font-medium",
                  improved ? "text-success" : "text-magenta"
                )}
              >
                <TrendIcon className="h-4 w-4" />
                {formatDelta(stats.deltaStart)} {unit} since starting
                {stats.pctStart !== null &&
                  ` (${formatDelta(stats.pctStart)}%)`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  range === r.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data in this range.
          </p>
        ) : chartData.length === 1 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-4xl font-bold tabular-nums">
              {formatNumber(chartData[0].value)} {unit}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(chartData[0].date)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              One record so far — add another to see progression.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
            >
              <defs>
                <linearGradient
                  id={`trend-grad-${color}`}
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
              />
              <Tooltip
                content={<CustomTooltip unit={unit} />}
                cursor={{ stroke: "hsl(var(--border))" }}
              />
              {stats && (
                <ReferenceLine
                  y={stats.lowest}
                  stroke={`hsl(var(--chart-${color}))`}
                  strokeDasharray="2 4"
                  strokeOpacity={0.4}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={`hsl(var(--chart-${color}))`}
                strokeWidth={2.5}
                fill={`url(#trend-grad-${color})`}
                dot={{ r: 2.5 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
            <Stat label="Starting" value={`${formatNumber(stats.starting)} ${unit}`} />
            <Stat label="Latest" value={`${formatNumber(stats.latest)} ${unit}`} />
            <Stat
              label="Total change"
              value={`${formatDelta(stats.deltaStart)} ${unit}`}
              tone={improved ? "success" : "magenta"}
            />
            <Stat label="Lowest" value={`${formatNumber(stats.lowest)} ${unit}`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "magenta";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "magenta" && "text-magenta"
        )}
      >
        {value}
      </p>
    </div>
  );
}
