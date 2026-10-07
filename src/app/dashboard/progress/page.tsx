import Link from "next/link";
import { Activity, BarChart3, Dumbbell, Trophy } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import {
  HYPERTROPHY_SETS_MAX,
  HYPERTROPHY_SETS_MIN,
  MUSCLE_GROUPS,
  type ExerciseStatus,
  type Period,
} from "@/lib/training-analytics";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { ProgressLineChart } from "@/components/charts/line-chart";
import { CoachTips } from "@/components/progress/coach-tips";
import { MuscleRadar } from "@/components/charts/muscle-radar";
import { Sparkline } from "@/components/charts/sparkline";

const STATUS_LABEL: Record<ExerciseStatus, { label: string; className: string }> = {
  progressing: { label: "Progressing", className: "bg-success/15 text-success" },
  stalled: { label: "Stalled", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  regressing: { label: "Dropping", className: "bg-destructive/15 text-destructive" },
  new: { label: "New", className: "bg-muted text-muted-foreground" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground" },
};

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
  const seriesById = new Map(data.series.map((s) => [s.exerciseId, s]));

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exercise progression</CardTitle>
<CardDescription>Est. strength (Epley), first → latest session</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exercise</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="w-28">Trend</TableHead>
                <TableHead className="text-right">First → latest</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.exercises.slice(0, 15).map((e) => (
                <TableRow key={e.exerciseId}>
                  <TableCell>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.muscleGroup} · last {formatDate(e.lastPerformed)}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.sessions}</TableCell>
                  <TableCell>
                    <Sparkline values={(seriesById.get(e.exerciseId)?.points ?? []).map((p) => p.e1rm)} height={32} color={e.status === "regressing" ? 3 : e.status === "stalled" ? 4 : 1} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(e.firstE1rm)} → {formatNumber(e.latestE1rm)} kg
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.changePct === null ? "—" : `${e.changePct > 0 ? "+" : ""}${e.changePct}%`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className={cn("border-0", STATUS_LABEL[e.status].className)} variant="secondary">
                      {STATUS_LABEL[e.status].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
