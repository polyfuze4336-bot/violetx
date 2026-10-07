import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dumbbell, Eye, Flame, Gauge, Ruler, Target, Trophy, Weight } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { TrendChartCard } from "@/components/charts/trend-chart-card";
import { ProgressLineChart } from "@/components/charts/line-chart";
import { SimpleBars } from "@/components/charts/simple-bars";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeSeriesStats } from "@/lib/analytics";
import { APP_NAME, PATIENT_LABEL } from "@/lib/constants";
import { formatDate, formatDelta, formatNumber } from "@/lib/format";
import type { MeasurementEntryDTO } from "@/lib/dto";
import { shareLinkService } from "@/lib/services/shareLink";

// Token-authorised and per-request: never cached or indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Coach view",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function CoachSharePage({
  params,
}: {
  params: { token: string };
}) {
  const data = await shareLinkService.getSharedProgress(params.token);
  if (!data) notFound();

  const weightStats = computeSeriesStats(
    data.weights.map((w) => ({ date: w.date, value: w.weightKg }))
  );

  const byType = new Map<string, MeasurementEntryDTO[]>();
  for (const m of data.measurements) {
    const list = byType.get(m.typeName) ?? [];
    list.push(m);
    byType.set(m.typeName, list);
  }
  const measurementSeries = Array.from(byType.entries()).map(
    ([name, entries]) => ({
      name,
      unit: entries[entries.length - 1].unit,
      entries,
    })
  );

  const lastUpdated = [
    data.weights[data.weights.length - 1]?.date,
    data.measurements[data.measurements.length - 1]?.date,
    data.recentSets[0]?.date,
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

  return (
    <div className="app-surface min-h-screen">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Eye className="h-3 w-3" /> Read-only coach view
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {PATIENT_LABEL} — progress
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lastUpdated
              ? `Last activity ${formatDate(lastUpdated)}`
              : "No activity recorded yet"}{" "}
            · link valid until {formatDate(data.expiresAt)}
          </p>
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Body weight"
            icon={Weight}
            value={weightStats ? formatNumber(weightStats.latest) : "—"}
            unit={weightStats ? "kg" : undefined}
            hint={
              weightStats && weightStats.count > 1
                ? `${formatDelta(weightStats.deltaStart)} kg since start`
                : undefined
            }
          />
          <StatCard
            label="Measurements tracked"
            icon={Ruler}
            accent="magenta"
            value={String(measurementSeries.length)}
          />
          <StatCard
            label="Exercises with records"
            icon={Dumbbell}
            value={String(data.records.length)}
          />
          <StatCard
            label="PRs achieved"
            icon={Trophy}
            accent="success"
            value={String(data.prEvents.length)}
          />
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Workouts / week" icon={Dumbbell} value={String(data.training.workoutsPerWeek)} hint={`${data.training.workouts} in 3 months`} />
          <StatCard label="Consistency" icon={Flame} accent="success" value={data.training.consistencyPct !== null ? `${data.training.consistencyPct}%` : "—"} />
          <StatCard label="Program adherence" icon={Gauge} accent="magenta" value={data.training.adherencePct !== null ? `${data.training.adherencePct}%` : "—"} />
          <StatCard label="Readiness (latest)" icon={Target} value={data.readiness.length ? String(data.readiness[data.readiness.length - 1].score) : "—"} />
        </section>

        {data.goals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.goals.map((g) => (
                <div key={g.title} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{g.title}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {g.current ?? "—"} / {g.target} {g.unit.startsWith("/") ? "" : g.unit}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={g.achieved ? "h-full rounded-full bg-success" : "h-full rounded-full bg-brand-gradient"} style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.weights.length > 0 && (
          <TrendChartCard
            title="Body weight"
            unit="kg"
            color={1}
            goalLowerIsBetter
            points={data.weights.map((w) => ({
              date: w.date,
              value: w.weightKg,
            }))}
          />
        )}

        {measurementSeries.length > 0 && (
          <section className="grid gap-4 md:grid-cols-2">
            {measurementSeries.map((s, i) => (
              <TrendChartCard
                key={s.name}
                title={s.name}
                unit={s.unit.toLowerCase()}
                color={(i % 5) + 1}
                goalLowerIsBetter
                points={s.entries.map((e) => ({ date: e.date, value: e.value }))}
              />
            ))}
          </section>
        )}

        {data.training.e1rm.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estimated strength</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressLineChart
                data={Array.from(new Set(data.training.e1rm.flatMap((t) => t.points.map((p) => p.date)))).sort().map((d) => {
                  const row: Record<string, string | number> = { label: formatDate(d).replace(/ \d{4}$/, "") };
                  data.training.e1rm.forEach((t) => {
                    const p = t.points.find((x) => x.date === d);
                    if (p) row[t.name] = p.e1rm;
                  });
                  return row;
                })}
                xKey="label"
                series={data.training.e1rm.map((t, i) => ({ key: t.name, name: t.name, color: (i % 5) + 1 }))}
                unit="kg"
                height={260}
              />
            </CardContent>
          </Card>
        )}

        {data.training.weeklyVolume.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training volume</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBars data={data.training.weeklyVolume.map((v) => ({ ...v }))} xKey="label" series={[{ key: "volumeKg", name: "Volume (kg)", color: 1 }]} height={200} />
            </CardContent>
          </Card>
        )}

        {data.readiness.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Readiness trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressLineChart data={data.readiness.map((r) => ({ label: formatDate(r.date).replace(/ \d{4}$/, ""), score: r.score }))} xKey="label" series={[{ key: "score", name: "Readiness", color: 3 }]} height={180} />
            </CardContent>
          </Card>
        )}

        {data.workouts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent workouts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {data.workouts.map((w, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{w.name ?? w.exercises.slice(0, 2).join(", ")}</span>
                      <span className="block text-xs text-muted-foreground">{formatDate(w.date)}{w.durationMin !== null ? ` · ${w.durationMin} min` : ""}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {w.sets} sets · {(w.volumeKg / 1000).toFixed(1)} t
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {data.records.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal records</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exercise</TableHead>
                    <TableHead className="text-right">Max weight</TableHead>
                    <TableHead className="text-right">Max reps</TableHead>
                    <TableHead className="text-right">Est. strength*</TableHead>
                    <TableHead className="text-right">Last</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.map((r) => (
                    <TableRow key={r.exerciseId}>
                      <TableCell className="font-medium">
                        {r.exerciseName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(r.maxWeightKg)} kg × {r.maxWeightReps}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.maxReps} × {formatNumber(r.maxRepsWeightKg)} kg
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(r.estimatedOneRepMaxKg)} kg
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(r.lastPerformed)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                *Estimated using the Epley formula — not an actual one-rep max.
              </p>
            </CardContent>
          </Card>
        )}

        {data.recentSets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent sets</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {data.recentSets.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="font-medium">{s.exerciseName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.reps} × {formatNumber(s.weightKg)} kg ·{" "}
                      {formatDate(s.date)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {data.weights.length === 0 &&
          data.measurements.length === 0 &&
          data.records.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              No progress has been recorded yet.
            </p>
          )}
      </main>
    </div>
  );
}
