"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface BarSeries {
  key: string;
  name: string;
  /** Chart palette index 1-5. */
  color?: number;
}

/** Grouped bar chart over a shared x axis. */
export function SimpleBars({
  data,
  xKey,
  series,
  height = 220,
  legend = false,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: BarSeries[];
  height?: number;
  legend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
        />
        {legend && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={`hsl(var(--chart-${s.color ?? 1}))`} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
