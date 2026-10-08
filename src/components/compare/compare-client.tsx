"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDelta, formatNumber } from "@/lib/format";

export interface BodySeries {
  name: string;
  unit: string; // display unit, e.g. "kg", "cm", "in"
  points: { date: string; value: number }[]; // ascending
}
export interface StrengthSeries {
  name: string;
  /** Assisted lift: weightKg is assistance, so less is stronger. */
  assisted?: boolean;
  points: { date: string; weightKg: number; reps: number }[]; // ascending
}

function atOrBefore<T extends { date: string }>(
  points: T[],
  startIso: string
): T {
  let chosen = points[0];
  for (const p of points) {
    if (p.date.slice(0, 10) <= startIso) chosen = p;
    else break;
  }
  return chosen;
}

export function CompareClient({
  bodySeries,
  strengthSeries,
  minDate,
}: {
  bodySeries: BodySeries[];
  strengthSeries: StrengthSeries[];
  minDate: string;
}) {
  const [start, setStart] = useState(minDate);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <div className="space-y-1">
            <Label htmlFor="compare-start">Start date</Label>
            <Input
              id="compare-start"
              type="date"
              value={start}
              min={minDate}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="pb-2 text-sm text-muted-foreground">
            versus <span className="font-medium text-foreground">Current</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Body progress</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Measurement</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bodySeries.map((s) => {
                const startPoint = atOrBefore(s.points, start);
                const current = s.points[s.points.length - 1];
                const change = current.value - startPoint.value;
                return (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(startPoint.value)} {s.unit}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(current.value)} {s.unit}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums font-medium",
                        change < 0 && "text-success",
                        change > 0 && "text-magenta"
                      )}
                    >
                      {formatDelta(change)} {s.unit}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strength progress</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {strengthSeries.map((s) => {
            const startPerf = atOrBefore(s.points, start);
            const assisted = !!s.assisted;
            const current = s.points.reduce((best, p) =>
              (assisted ? p.weightKg < best.weightKg : p.weightKg > best.weightKg) ||
              (p.weightKg === best.weightKg && p.reps > best.reps)
                ? p
                : best
            );
            const increase = assisted
              ? startPerf.weightKg - current.weightKg
              : current.weightKg - startPerf.weightKg;
            const unitSuffix = assisted ? "kg assistance" : "kg";
            return (
              <div key={s.name} className="rounded-xl border p-4">
                <p className="font-semibold">{s.name}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Start</p>
                    <p className="tabular-nums">
                      {startPerf.weightKg}{unitSuffix} × {startPerf.reps}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Current</p>
                    <p className="tabular-nums">
                      {current.weightKg}{unitSuffix} × {current.reps}
                    </p>
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-3 text-sm font-semibold tabular-nums",
                    increase > 0 ? "text-success" : "text-muted-foreground"
                  )}
                >
                  {assisted
                    ? increase >= 0
                      ? "Assistance reduced"
                      : "Assistance increased"
                    : `Maximum load ${increase >= 0 ? "increase" : "change"}`}
                  :{" "}
                  {assisted ? `${Math.abs(increase)}kg` : `${formatDelta(increase)}kg`}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
