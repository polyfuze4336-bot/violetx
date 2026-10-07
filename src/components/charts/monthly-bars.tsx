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

export interface MonthlyBarDatum {
  label: string;
  sessions: number;
  prs: number;
}

/** Sessions and new PRs per month as grouped bars. */
export function MonthlyBars({ data }: { data: MonthlyBarDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
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
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sessions" name="Sessions" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
        <Bar dataKey="prs" name="New PRs" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
