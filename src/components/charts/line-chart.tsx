"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartSeries {
  key: string;
  name: string;
  /** Chart palette index 1-5, maps to --chart-N. */
  color?: number;
}

export interface ProgressLineChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: ChartSeries[];
  unit?: string;
  height?: number;
}

export function ProgressLineChart({
  data,
  xKey,
  series,
  unit,
  height = 280,
}: ProgressLineChartProps) {
  // A single record has no progression to draw — show the value instead.
  if (data.length === 1) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        {series.map((s) => (
          <p key={s.key} className="text-3xl font-bold tabular-nums">
            {data[0][s.key]}
            {unit ? ` ${unit}` : ""}
          </p>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">
          One record so far — add another to see progression.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`area-grad-${s.color ?? 1}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={`hsl(var(--chart-${s.color ?? 1}))`}
                stopOpacity={0.22}
              />
              <stop
                offset="100%"
                stopColor={`hsl(var(--chart-${s.color ?? 1}))`}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-muted"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
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
          width={44}
          className="fill-muted-foreground"
          domain={["auto", "auto"]}
          unit={unit ? ` ${unit}` : undefined}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          formatter={(value, name) => [
            `${value}${unit ? ` ${unit}` : ""}`,
            name,
          ]}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={`hsl(var(--chart-${s.color ?? 1}))`}
            strokeWidth={2}
            fill={`url(#area-grad-${s.color ?? 1})`}
            dot={{ r: 2 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
