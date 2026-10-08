import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Dumbbell,
  Eye,
  Flame,
  Gauge,
  Sparkles,
  Target,
  Trophy,
  Weight,
} from "lucide-react";

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
import { shareLinkService, type SharedProgressDTO } from "@/lib/services/shareLink";

// Token-authorised and per-request: never cached or indexed. This page has no
// forms, links to actions or server actions: it can only read.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Coach view",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const KIND_STYLE: Record<string, string> = {
  WEIGHT: "bg-primary/10 text-primary",
  ASSISTANCE: "bg-primary/10 text-primary",
  REPS: "bg-magenta/10 text-magenta",
  E1RM: "bg-success/10 text-success",
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

  const byType = new Map<string, SharedProgressDTO["measurements"]>();
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

  const totalPrs = Object.values(data.prCounts).reduce((a, b) => a + b, 0);
  const assistedRecords = data.records.filter((r) => r.assisted);
  const progressionGroups: { key: "LOAD" | "REPS" | "ASSISTANCE"; title: string; hint?: string }[] = [
    { key: "LOAD", title: "Load progression" },
    { key: "REPS", title: "Rep progression", hint: "More reps at the same load counts as progress" },
    { key: "ASSISTANCE", title: "Assisted exercise progression", hint: "Lower assistance = stronger" },
  ];

  return (
    <div className="app-surface min-h-screen">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <Badge variant="secondary" className="gap-1 uppercase tracking-wide">
            <Eye className="h-3 w-3" /> Read only coach view
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
            · {data.expiresAt ? `link valid until ${formatDate(data.expiresAt)}` : "link does not expire"}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> READ ONLY COACH VIEW — nothing on this page can be changed.
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
          <StatCard label="Workouts / week" icon={Dumbbell} value={String(data.training.workoutsPerWeek)} hint={`${data.training.workouts} in 3 months`} />
          <StatCard label="Consistency" icon={Flame} accent="success" value={data.training.consistencyPct !== null ? `${data.training.consistencyPct}%` : "—"} />
          <StatCard label="Program adherence" icon={Gauge} accent="magenta" value={data.training.adherencePct !== null ? `${data.training.adherencePct}%` : "—"} />
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Weight PRs" icon={Trophy} value={String(data.prCounts.WEIGHT)} />
          <StatCard label="Rep PRs" icon={Trophy} accent="magenta" value={String(data.prCounts.REPS)} />
          <StatCard label="Est. 1RM PRs" icon={Trophy} accent="success" value={String(data.prCounts.E1RM)} />
          <StatCard label="Assistance PRs" icon={Trophy} value={String(data.prCounts.ASSISTANCE)} hint={`${totalPrs} PRs in total`} />
        </section>

        {(data.observations.bullets.length > 0 || data.observations.conclusion) && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Violet observations
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Calculated from the recorded data on this page, last 90 days.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ul className="list-inside list-disc space-y-1">
                {data.observations.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {data.observations.conclusion && (
                <p className="rounded-lg bg-background/70 p-3 font-medium">{data.observations.conclusion}</p>
              )}
            </CardContent>
          </Card>
        )}

        {data.goals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-primary" /> Current goals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.goals.map((g) => (
                <div key={g.title} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{g.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
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
            title="Weight trend"
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
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Measurement progress</h2>
            <div className="grid gap-4 md:grid-cols-2">
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
            </div>
          </section>
        )}

        {data.progressions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Strength progression</CardTitle>
              <p className="text-xs text-muted-foreground">Latest session compared with the one before it.</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {progressionGroups.map((g) => {
                const items = data.progressions.filter((p) => p.kind === g.key);
                if (items.length === 0) return null;
                return (
                  <div key={g.key} className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{g.title}</p>
                    {g.hint && <p className="text-[11px] text-muted-foreground">{g.hint}</p>}
                    <ul className="space-y-1 text-sm">
                      {items.map((p) => (
                        <li key={p.text} className="flex items-start gap-1.5 font-medium text-success">
                          {g.key === "ASSISTANCE" ? <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0" /> : <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" />}
                          <span>{p.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {data.achievements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-primary" /> Recent achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {data.achievements.slice(0, 10).map((a, i) => (
                  <li key={`${a.exerciseName}-${a.date}-${a.kind}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.exerciseName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(a.date)} · {a.detail}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_STYLE[a.kind]}`}>
                      {a.label}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
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

        {assistedRecords.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assisted exercises</CardTitle>
              <p className="text-xs text-muted-foreground">Lower assistance = stronger. Estimated 1RM does not apply.</p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {assistedRecords.map((r) => (
                <div key={r.exerciseName} className="rounded-xl border p-3">
                  <p className="text-sm font-semibold">{r.exerciseName}</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatNumber(r.maxWeightKg)}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">kg assistance × {r.maxWeightReps}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Lowest assistance · last {formatDate(r.lastPerformed)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.training.weeklyWorkouts.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workout frequency</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBars data={data.training.weeklyWorkouts.map((v) => ({ ...v }))} xKey="label" series={[{ key: "workouts", name: "Workouts", color: 2 }]} height={180} />
            </CardContent>
          </Card>
        )}

        {data.training.weeklyVolume.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Training volume</CardTitle>
              <p className="text-xs text-muted-foreground">Assisted exercises are excluded from volume.</p>
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
              <CardTitle className="text-base">Workout history</CardTitle>
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
                    <TableRow key={r.exerciseName}>
                      <TableCell className="font-medium">
                        {r.exerciseName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(r.maxWeightKg)} kg{r.assisted ? " assist" : ""} × {r.maxWeightReps}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.maxReps} × {formatNumber(r.maxRepsWeightKg)} kg{r.assisted ? " assist" : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.assisted ? "—" : `${formatNumber(r.estimatedOneRepMaxKg)} kg`}
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
                {data.recentSets.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate font-medium">{s.exerciseName}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {s.reps} × {formatNumber(s.weightKg)} kg{s.assisted ? " assist" : ""} ·{" "}
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

        <p className="pb-4 text-center text-xs text-muted-foreground">
          Shared by {PATIENT_LABEL} · read only · {APP_NAME}
        </p>
      </main>
    </div>
  );
}
