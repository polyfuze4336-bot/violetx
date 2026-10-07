"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

/** Tiny axis-less trend line for cards and table cells. */
export function Sparkline({
  values,
  color = 1,
  height = 40,
}: {
  values: number[];
  color?: number;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) {
    return <div style={{ height }} className="rounded bg-muted/50" aria-hidden />;
  }
  const data = values.map((v, i) => ({ i, v }));
  const stroke = `hsl(var(--chart-${color}))`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
