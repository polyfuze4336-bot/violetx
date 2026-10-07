import Link from "next/link";
import { Activity, BarChart3, Clock, Dumbbell, Flame, Gauge, Trophy } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { analyticsService } from "@/lib/services/analytics";
import { RANGES, type RangeKey } from "@/lib/analytics-engine";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { HBarChart } from "@/components/charts/h-bar-chart";
import { ProgressLineChart } from "@/components/charts/line-chart";
import { SimpleBars } from "@/components/charts/simple-bars";
import { Sparkline } from "@/components/charts/sparkline";

export const dynamic = "force-dynamic";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const viewer = await requireAuth();
  const range = (RANGES as readonly string[]).includes(searchParams.range ?? "") ? (searchParams.range as RangeKey) : "3M";
  const a = viewer.athleteId ? await analyticsService.get(range) : null;

  const tabs = (
    <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-1 text-sm">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/dashboard/analytics?range=${r}`}
          scroll={false}
          className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", r === range ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {r}
        </Link>
      ))}
    </div>
  );

  if (!a || a.totals.sets === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" action={tabs} />
        <EmptyState icon={BarChart3} title="No training in this range" />
      </div>
    );
  }

  // e1RM trends share an x axis (date) with one column per exercise.
  const e1rmDates = Array.from(new Set(a.e1rmTrends.flatMap((t) => t.points.map((p) => p.date)))).sort();
  const e1rmData = e1rmDates.map((d) => {
    const row: Record<string, string | number> = { label: formatDate(d).replace(/ \d{4}$/, "") };
    a.e1rmTrends.forEach((t) => {
      const p = t.points.find((x) => x.date === d);
      if (p) row[t.name] = p.e1rm;
    });
    return row;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" action={tabs} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Workouts" icon={Dumbbell} value={String(a.totals.workouts)} hint={`${a.totals.workoutsPerWeek}/week`} />
        <StatCard label="Volume" icon={BarChart3} accent="magenta" value={formatNumber(a.totals.volumeKg / 1000, 1)} unit="t" />
        <StatCard label="Sets" icon={Activity} value={String(a.totals.sets)} />
        <StatCard label="Avg session" icon={Clock} value={a.totals.avgDurationMin !== null ? String(a.totals.avgDurationMin) : "—"} unit={a.totals.avgDurationMin !== null ? "min" : undefined} />
        <StatCard label="Avg RPE" icon={Gauge} value={a.totals.avgSessionRpe !== null ? String(a.totals.avgSessionRpe) : "—"} />
        <StatCard label="Consistency" icon={Flame} accent="success" value={a.consistency.pct !== null ? `${a.consistency.pct}%` : "—"} hint={`${a.consistency.weeksMet}/${a.consistency.weeks} wks ≥${a.consistency.weeklyTarget}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Workouts">
          <SimpleBars data={a.buckets.map((b) => ({ ...b }))} xKey="label" series={[{ key: "workouts", name: "Workouts", color: 1 }, { key: "prs", name: "PRs", color: 2 }]} legend />
        </Section>
        <Section title="Volume (kg)">
          <ProgressLineChart data={a.buckets.map((b) => ({ ...b }))} xKey="label" series={[{ key: "volumeKg", name: "Volume", color: 1 }]} unit="kg" height={220} />
        </Section>
        <Section title="Sets by muscle group">
          <HBarChart data={a.volumeByMuscle.map((m) => ({ name: m.muscle, value: m.sets }))} />
          {a.observations.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
              {a.observations.map((o) => (
                <li key={o} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {o}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Training days">
          <SimpleBars data={a.weekdayDistribution} xKey="label" series={[{ key: "workouts", name: "Workouts", color: 3 }]} />
        </Section>
        <Section title="Volume by exercise">
          <HBarChart data={a.volumeByExercise.map((e) => ({ name: e.name, value: Math.round(e.volumeKg / 100) / 10 }))} unit="t" colorVar="--chart-2" />
        </Section>
        <Section title="Exercise frequency">
          <HBarChart data={a.exerciseFrequency.map((e) => ({ name: e.name, value: e.sessions }))} colorVar="--chart-3" />
        </Section>
      </div>

      {a.e1rmTrends.length > 0 && (
        <Section title="Estimated 1RM trends">
          <ProgressLineChart data={e1rmData} xKey="label" series={a.e1rmTrends.map((t, i) => ({ key: t.name, name: t.name, color: (i % 5) + 1 }))} unit="kg" height={280} />
          <div className="mt-3 flex flex-wrap gap-2">
            {a.e1rmTrends.map((t) => (
              <span key={t.name} className="rounded-full border px-2.5 py-1 text-xs font-medium">
                {t.name}{" "}
                {t.changePct !== null && (
                  <span className={t.changePct >= 0 ? "text-success" : "text-magenta"}>
                    {t.changePct >= 0 ? "▲" : "▼"} {Math.abs(t.changePct)}%
                  </span>
                )}
              </span>
            ))}
          </div>
        </Section>
      )}

      {a.weightVsStrength.filter((p) => p.weightIndex !== null && p.strengthIndex !== null).length >= 2 && (
        <Section title="Body weight vs strength (indexed to 100)">
          <ProgressLineChart
            data={a.weightVsStrength.map((p) => ({ label: p.label, weight: p.weightIndex ?? 0, strength: p.strengthIndex ?? 0 }))}
            xKey="label"
            series={[{ key: "weight", name: "Body weight", color: 2 }, { key: "strength", name: "Strength", color: 1 }]}
            height={240}
          />
        </Section>
      )}

      {a.measurementTrends.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {a.measurementTrends.map((m) => (
            <Card key={m.name} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{m.name}</p>
                <span className={cn("text-xs font-semibold", m.delta <= 0 ? "text-success" : "text-magenta")}>
                  {m.delta > 0 ? "+" : ""}
                  {m.delta} {m.unit.toLowerCase()}
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{m.latest}</p>
              <Sparkline values={m.points} height={36} color={2} />
            </Card>
          ))}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {a.prTimeline.length > 0 && (
          <Section title="PR timeline">
            <ul className="space-y-2">
              {a.prTimeline.slice(0, 8).map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Trophy className={cn("h-4 w-4", p.type === "WEIGHT" ? "text-primary" : "text-magenta")} />
                    <span className="font-medium">{p.exerciseName}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(p.weightKg)} kg × {p.reps} · {formatDate(p.date)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {a.durations.length > 0 && (
          <Section title="Session duration (min)">
            <ProgressLineChart data={a.durations.map((d) => ({ label: formatDate(d.date).replace(/ \d{4}$/, ""), minutes: d.minutes }))} xKey="label" series={[{ key: "minutes", name: "Minutes", color: 3 }]} unit="min" height={200} />
          </Section>
        )}
        {a.adherence && (
          <Section title="Program adherence">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{a.adherence.pct !== null ? `${a.adherence.pct}%` : "—"}</span>
              <span className="text-sm text-muted-foreground">
                {a.adherence.done}/{a.adherence.planned} planned sessions
              </span>
            </div>
            <SimpleBars data={a.adherence.weekly} xKey="label" series={[{ key: "planned", name: "Planned", color: 5 }, { key: "done", name: "Done", color: 1 }]} legend height={180} />
          </Section>
        )}
      </div>
    </div>
  );
}
