"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/** Weekly sets per muscle group vs the ~10-set hypertrophy floor. */
export function MuscleRadar({
  data,
  target = 10,
}: {
  data: { muscle: string; sets: number }[];
  target?: number;
}) {
  const rows = data.map((d) => ({ ...d, target }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid className="stroke-muted" />
        <PolarAngleAxis dataKey="muscle" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
        <Radar
          name="Target"
          dataKey="target"
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          fill="none"
          isAnimationActive={false}
        />
        <Radar
          name="Sets / week"
          dataKey="sets"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          fill="hsl(var(--chart-1))"
          fillOpacity={0.3}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
