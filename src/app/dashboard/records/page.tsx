import Link from "next/link";
import { Dumbbell, Medal, Trophy, TrendingUp } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { personalRecordService } from "@/lib/services/personalRecord";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import { formatShortDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { HBarChart } from "@/components/charts/h-bar-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { PrProgress } from "@/components/records/pr-progress";

export default async function RecordsPage() {
  const viewer = await requireAuth();
  const [records, history] = viewer.athleteId
    ? await Promise.all([
        personalRecordService.list(),
        trainingProgressService.history(),
      ])
    : [[], null];

  if (records.length === 0 || !history) {
    return (
      <div>
        <PageHeader title="Personal records" />
        <EmptyState icon={Trophy} title="No records yet" />
      </div>
    );
  }

  const { series, prEvents } = history;
  const seriesById = new Map(series.map((s) => [s.exerciseId, s]));
  const prCountByExercise = new Map<string, number>();
  for (const e of prEvents.filter((p) => p.type === "WEIGHT")) {
    prCountByExercise.set(e.exerciseId, (prCountByExercise.get(e.exerciseId) ?? 0) + 1);
  }
  const heaviest = records.reduce((a, b) => (b.maxWeightKg > a.maxWeightKg ? b : a));
  const leaderboard = [...records]
    .sort((a, b) => b.estimatedOneRepMaxKg - a.estimatedOneRepMaxKg)
    .slice(0, 10)
    .map((r) => ({ name: r.exerciseName, value: r.estimatedOneRepMaxKg }));
  const latest = prEvents.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Personal records" />

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="PRs" icon={Trophy} accent="magenta" value={String(prEvents.length)} />
        <StatCard label="Lifts" icon={Dumbbell} value={String(records.length)} />
        <StatCard
          label={heaviest.exerciseName}
          icon={Medal}
          accent="success"
          value={formatNumber(heaviest.maxWeightKg)}
          unit="kg"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PrProgress series={series} />
        </CardContent>
      </Card>

      {latest.length > 0 && (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {latest.map((e, i) => (
            <div
              key={i}
              className="flex min-w-[9.5rem] shrink-0 flex-col gap-1 rounded-xl border bg-card p-3"
            >
              <Trophy className={cn("h-4 w-4", e.type === "WEIGHT" ? "text-primary" : "text-magenta")} />
              <p className="truncate text-sm font-semibold">{e.exerciseName}</p>
              <p className="text-lg font-bold tabular-nums">
                {formatNumber(e.weightKg)}
                <span className="text-xs font-medium text-muted-foreground"> kg × {e.reps}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">{formatShortDate(e.date)}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strongest lifts</CardTitle>
        </CardHeader>
        <CardContent>
          <HBarChart data={leaderboard} unit="kg" />
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {records.map((r) => {
          const points = seriesById.get(r.exerciseId)?.points ?? [];
          const first = points[0]?.maxWeightKg ?? 0;
          const pct = first > 0 ? Math.round(((r.maxWeightKg - first) / first) * 100) : 0;
          return (
            <Link key={r.exerciseId} href={`/dashboard/exercises/${r.exerciseId}`}>
              <Card className="h-full p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{r.exerciseName}</p>
                  {points.length > 1 && (
                    <span className={cn("text-xs font-semibold", pct >= 0 ? "text-success" : "text-magenta")}>
                      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {formatNumber(r.maxWeightKg)}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">kg</span>
                </p>
                <Sparkline values={points.map((p) => p.maxWeightKg)} height={44} />
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3 w-3" /> {prCountByExercise.get(r.exerciseId) ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Dumbbell className="h-3 w-3" /> {r.totalSets}
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
