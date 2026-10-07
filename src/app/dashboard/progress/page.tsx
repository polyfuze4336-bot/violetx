import Link from "next/link";
import { Activity, BarChart3, Dumbbell, Trophy } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import {
  HYPERTROPHY_SETS_MAX,
  HYPERTROPHY_SETS_MIN,
  MUSCLE_GROUPS,
  type Period,
} from "@/lib/training-analytics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { ProgressLineChart } from "@/components/charts/line-chart";
import { CoachTips } from "@/components/progress/coach-tips";
import { ProgressMatrix } from "@/components/progress/progress-matrix";
import { MuscleRadar } from "@/components/charts/muscle-radar";



function delta(current: number, previous: number, unit: string): { text: string; trend: "up" | "down" | "neutral" } {
  if (previous === 0) return { text: current > 0 ? "new" : "—", trend: "neutral" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    text: `${pct > 0 ? "+" : ""}${pct}% vs last ${unit}`,
    trend: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
  };
}

export default async function TrainingProgressPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const viewer = await requireAuth();
  const period: Period = searchParams.period === "month" ? "month" : "week";
  const data = await trainingProgressService.get(period);

  const hasData = data.window.totalSets > 0 || data.periods.some((p) => p.sets > 0);
  const unit = period === "week" ? "week" : "month";
  const current = data.periods[data.periods.length - 1];
  const previous = data.periods[data.periods.length - 2];

  const radarData = MUSCLE_GROUPS.filter((g) => g !== "Other" && data.window.weeklySetsByMuscle[g]).map(
    (g) => ({ muscle: g, sets: data.window.weeklySetsByMuscle[g] ?? 0 })
  );

  const toggle = (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
      {(["week", "month"] as const).map((p) => (
        <Link
          key={p}
          href={`/dashboard/progress?period=${p}`}
          scroll={false}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            period === p
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p === "week" ? "Weekly" : "Monthly"}
        </Link>
      ))}
    </div>
  );

  if (!hasData) {
    return (
      <div>
        <PageHeader title="Training progress" description="Weekly and monthly workout progress with coaching tips." action={toggle} />
        <EmptyState
          icon={Dumbbell}
          title="No workouts yet"
          description="Import your WhatsApp workout chat or log sets to see volume, progression and coaching tips."
          action={viewer.role === "OWNER" ? <ImportWorkoutButton /> : undefined}
        />
      </div>
    );
  }

  const volumeDelta = delta(current.volumeKg, previous?.volumeKg ?? 0, unit);
  const setsDelta = delta(current.sets, previous?.sets ?? 0, unit);

  const chartData = data.periods.map((p) => ({
    label: p.label,
    volume: p.volumeKg,
    sets: p.sets,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training progress"
        description={`How your training is trending, ${period === "week" ? "week by week" : "month by month"}.`}
        action={toggle}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`Sessions this ${unit}`}
          icon={Activity}
          value={String(current.sessions)}
          hint={`${previous?.sessions ?? 0} last ${unit}`}
        />
        <StatCard
          label="Sets"
          icon={Dumbbell}
          accent="magenta"
          value={String(current.sets)}
          hint={setsDelta.text}
          trend={setsDelta.trend}
        />
        <StatCard
          label="Volume"
          icon={BarChart3}
          value={formatNumber(current.volumeKg, 0)}
          unit="kg"
          hint={volumeDelta.text}
          trend={volumeDelta.trend}
        />
        <StatCard
          label="New PRs"
          icon={Trophy}
          accent="success"
          value={String(current.prs)}
          hint={`${previous?.prs ?? 0} last ${unit}`}
        />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="h-4 w-4 text-primary" /> Progress table
        </h2>
        <ProgressMatrix matrix={data.matrix} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Training volume</CardTitle>
            </CardHeader>
          <CardContent>
            <ProgressLineChart
              data={chartData}
              xKey="label"
              series={[{ key: "volume", name: "Volume", color: 1 }]}
              unit="kg"
              height={240}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sets completed</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressLineChart
              data={chartData}
              xKey="label"
              series={[{ key: "sets", name: "Sets", color: 2 }]}
              height={240}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Muscle balance</CardTitle>
          <CardDescription>Sets per week, last 4 weeks · dashed ring = {HYPERTROPHY_SETS_MIN}-set target</CardDescription>
        </CardHeader>
        <CardContent className="grid items-center gap-4 md:grid-cols-2">
          {radarData.length >= 3 ? (
            <MuscleRadar data={radarData} target={HYPERTROPHY_SETS_MIN} />
          ) : (
            <p className="text-sm text-muted-foreground">Train more muscle groups to see the balance chart.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {radarData.map((m) => {
              const low = m.sets < HYPERTROPHY_SETS_MIN;
              const high = m.sets > HYPERTROPHY_SETS_MAX;
              return (
                <span
                  key={m.muscle}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    low ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : high ? "border-magenta/40 text-magenta" : "border-success/40 text-success"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", low ? "bg-amber-500" : high ? "bg-magenta" : "bg-success")} />
                  {m.muscle} <span className="tabular-nums">{m.sets}</span>
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <CoachTips period={period} initialTips={data.tips} />
    </div>
  );
}
