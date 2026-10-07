"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

/** Ranked horizontal bars — a visual leaderboard. */
export function HBarChart({
  data,
  unit,
  colorVar = "--chart-1",
}: {
  data: { name: string; value: number }[];
  unit?: string;
  colorVar?: string;
}) {
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
        barCategoryGap={6}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          width={118}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
          className="fill-foreground"
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell
              key={d.name}
              fill={`hsl(var(${colorVar}))`}
              fillOpacity={1 - Math.min(i, 8) * 0.07}
            />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => `${v}${unit ? ` ${unit}` : ""}`}
            className="fill-muted-foreground text-xs"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
