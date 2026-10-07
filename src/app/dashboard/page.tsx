import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Dumbbell,
  MessageSquareText,
  Ruler,
  Sparkles,
  Trophy,
  Weight,
} from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { measurementService } from "@/lib/services/measurement";
import { exerciseService, exerciseEntryService } from "@/lib/services/exercise";
import { personalRecordService } from "@/lib/services/personalRecord";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import { ActivityHeatmap } from "@/components/charts/activity-heatmap";
import { HomeHero } from "@/components/dashboard/home-hero";
import { Sparkline } from "@/components/charts/sparkline";
import { computeSeriesStats, type SeriesStats } from "@/lib/analytics";
import {
  formatDate,
  formatDelta,
  formatMeasurement,
  formatNumber,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { FadeIn } from "@/components/motion/fade-in";
import { PATIENT_LABEL } from "@/lib/constants";
import type { MeasurementEntryDTO } from "@/lib/dto";
import type { PrEventDTO } from "@/lib/services/personalRecord";

const BODY_PROGRESS_ORDER = ["Chest", "Waist", "Hip", "Thigh", "Upper arm"];

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface TimelineItem {
  date: string;
  icon: "pr" | "weight" | "measurement";
  title: string;
  value: string;
  change: string | null;
  direction: "up" | "down" | "flat";
}

export default async function DashboardOverviewPage() {
  const viewer = await requireAuth();
  const isOwner = viewer.role === "OWNER";

  if (!viewer.athleteId) {
    return (
      <div>
        <PageHeader title="Overview" />
        <EmptyState
          icon={Weight}
          title="No athlete data available yet"
          description="Once the athlete has signed in and added data, progress will appear here."
        />
      </div>
    );
  }

  const [weights, measurements, exercises, prEvents, recentSets] =
    await Promise.all([
      bodyWeightService.list(),
      measurementService.listEntries(),
      exerciseService.list(),
      personalRecordService.prEvents(),
      exerciseEntryService.list({ take: 6 }),
    ]);

  const training = await trainingProgressService.history();

  // Most recent activity date across all record types.
  const lastUpdatedIso = [
    weights[weights.length - 1]?.date,
    measurements[measurements.length - 1]?.date,
    recentSets[0]?.date,
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

  // Weight stats (points are ascending by date).
  const weightStats = computeSeriesStats(
    weights.map((w) => ({ date: w.date, value: w.weightKg }))
  );

  // Measurements grouped by type name (entries are ascending by date).
  const seriesByName = new Map<
    string,
    { unit: string; entries: MeasurementEntryDTO[] }
  >();
  for (const e of measurements) {
    const g = seriesByName.get(e.typeName) ?? { unit: e.unit, entries: [] };
    g.unit = e.unit;
    g.entries.push(e);
    seriesByName.set(e.typeName, g);
  }
  const statsByName = new Map<
    string,
    { unit: string; stats: SeriesStats; latest: MeasurementEntryDTO }
  >();
  for (const [name, g] of Array.from(seriesByName.entries())) {
    const stats = computeSeriesStats(
      g.entries.map((e) => ({ date: e.date, value: e.value }))
    );
    if (stats) {
      statsByName.set(name, {
        unit: g.unit,
        stats,
        latest: g.entries[g.entries.length - 1],
      });
    }
  }

  const waist = findByName(statsByName, "waist");

  // Strength summary.
  const now = new Date();
  const thisMonthEvents = prEvents.filter((e) => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const improvedThisMonth = new Set(thisMonthEvents.map((e) => e.exerciseId))
    .size;
  const recentPR = prEvents[0] ?? null;

  const bodyProgress = BODY_PROGRESS_ORDER.map((name) => {
    const hit = findByName(statsByName, name.toLowerCase());
    return hit ? { name, ...hit } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const timeline = buildTimeline(weights, measurements, prEvents).slice(0, 8);

  const hasData = weights.length > 0 || measurements.length > 0 ||
    exercises.length > 0;

  return (
    <div className="space-y-8">
      <div>
        {isOwner ? (
          <>
            <p className="text-sm font-medium text-muted-foreground">
              {greeting()}, {PATIENT_LABEL}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Your <span className="text-brand-gradient">Evolution</span>
            </h1>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{PATIENT_LABEL}</h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Progress Overview
              {lastUpdatedIso &&
                ` · Last updated ${formatDate(lastUpdatedIso)}`}
            </p>
          </>
        )}
      </div>

      <HomeHero isOwner={isOwner} />

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/weight">
              <Weight className="h-4 w-4" />
              Log weight
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/import">
              <MessageSquareText className="h-4 w-4" />
              Import WhatsApp
            </Link>
          </Button>
        </div>
      )}

      {!hasData ? (
        <EmptyState
          icon={Weight}
          title={isOwner ? "No data yet" : "No progress recorded yet"}
          description={
            isOwner
              ? "Import your first WhatsApp update, or add a weigh-in to get started."
              : "The athlete's progress will appear here once they add data."
          }
          action={isOwner ? <ImportWorkoutButton label="Import Update" /> : undefined}
        />
      ) : (
        <>
          <FadeIn>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Current weight"
                value={weightStats ? formatNumber(weightStats.latest) : "—"}
                unit={weightStats ? "kg" : undefined}
                hint={
                  weightStats
                    ? weightStats.count > 1
                      ? `${formatDelta(weightStats.deltaPrev)} kg${
                          weightStats.pctPrev !== null
                            ? ` (${formatDelta(weightStats.pctPrev)}%)`
                            : ""
                        } · ${formatDate(weights[weights.length - 1].date)}`
                      : formatDate(weights[weights.length - 1].date)
                    : undefined
                }
                trend={
                  weightStats && weightStats.deltaPrev < 0
                    ? "up"
                    : weightStats && weightStats.deltaPrev > 0
                    ? "down"
                    : "neutral"
                }
                icon={Weight}
                accent="primary"
              />

              {waist ? (
                <StatCard
                  label="Waist"
                  value={formatNumber(waist.stats.latest)}
                  unit={waist.unit === "INCH" ? "in" : "cm"}
                  hint={`${formatDelta(waist.stats.deltaStart)} since start · ${formatDelta(
                    waist.stats.deltaPrev
                  )} since last`}
                  trend={waist.stats.deltaStart < 0 ? "up" : "down"}
                  icon={Ruler}
                  accent="primary"
                />
              ) : (
                <StatCard
                  label="Measurements"
                  value={String(statsByName.size)}
                  hint="types tracked"
                  icon={Ruler}
                  accent="primary"
                />
              )}

              <StatCard
                label="Exercises tracked"
                value={String(exercises.length)}
                icon={Dumbbell}
                accent="success"
              />
              <StatCard
                label="PRs this month"
                value={String(thisMonthEvents.length)}
                hint={`${improvedThisMonth} exercise${
                  improvedThisMonth === 1 ? "" : "s"
                } improved`}
                icon={Trophy}
                accent="magenta"
              />
            </div>
          </FadeIn>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Training activity</CardTitle>
              <Link
                href="/dashboard/progress"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Training progress <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_16rem] md:items-center">
              <ActivityHeatmap perDay={training.perDay} weeks={20} />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Volume · 12 months</p>
                <Sparkline values={training.months.map((m) => m.volumeKg)} height={64} />
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <RecentPrCard pr={recentPR} />
            <BodyProgressCard items={bodyProgress} />
            <StrengthProgressCard
              improvedThisMonth={improvedThisMonth}
              recentPrs={thisMonthEvents.length}
              totalExercises={exercises.length}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Progress timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Changes will appear here as you log data.
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {timeline.map((item, i) => (
                      <TimelineRow key={i} item={item} />
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Recent training</CardTitle>
                <Link
                  href="/dashboard/history"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all
                </Link>
              </CardHeader>
              <CardContent>
                {recentSets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No workouts recorded yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {recentSets.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div>
                          <p className="font-medium">{s.exerciseName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(s.date)}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {s.weightKg}kg × {s.reps}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function findByName<T>(map: Map<string, T>, lowerName: string): T | undefined {
  for (const [name, value] of Array.from(map.entries())) {
    if (name.toLowerCase() === lowerName) return value;
  }
  return undefined;
}

function RecentPrCard({ pr }: { pr: PrEventDTO | null }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-magenta" />
          Recent PR
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pr ? (
          <div className="space-y-1">
            <p className="text-lg font-semibold">{pr.exerciseName}</p>
            <p className="text-2xl font-bold tabular-nums">
              {formatNumber(pr.weightKg)} kg × {pr.reps} reps
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="rounded-full bg-brand-gradient px-2.5 py-0.5 text-xs font-semibold text-white">
                {pr.type === "WEIGHT" ? "NEW MAX WEIGHT" : "REP PR"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(pr.date)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No personal records yet. Log a few sets to start tracking PRs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BodyProgressCard({
  items,
}: {
  items: Array<{ name: string; unit: string; stats: SeriesStats }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Body progress</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No measurements recorded yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={it.name}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{it.name}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatMeasurement(it.stats.latest, it.unit)}
                  </span>
                  {it.stats.count > 1 && (
                    <span
                      className={
                        it.stats.deltaStart < 0
                          ? "text-xs font-medium text-success"
                          : it.stats.deltaStart > 0
                          ? "text-xs font-medium text-magenta"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {formatDelta(it.stats.deltaStart)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StrengthProgressCard({
  improvedThisMonth,
  recentPrs,
  totalExercises,
}: {
  improvedThisMonth: number;
  recentPrs: number;
  totalExercises: number;
}) {
  const rows = [
    { label: "Improved this month", value: improvedThisMonth },
    { label: "Recent PRs", value: recentPrs },
    { label: "Total exercises", value: totalExercises },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Strength progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <span className="text-lg font-bold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const Icon =
    item.direction === "down"
      ? ArrowDownRight
      : item.direction === "up"
      ? ArrowUpRight
      : ArrowRight;
  const accent =
    item.icon === "pr"
      ? "bg-magenta/10 text-magenta"
      : item.icon === "weight"
      ? "bg-primary/10 text-primary"
      : "bg-chart-5/10 text-chart-5";
  return (
    <li className="flex gap-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent}`}
      >
        {item.icon === "pr" ? (
          <Trophy className="h-4 w-4" />
        ) : item.icon === "weight" ? (
          <Weight className="h-4 w-4" />
        ) : (
          <Ruler className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 border-b pb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(item.date)}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="text-sm tabular-nums">{item.value}</p>
          {item.change && (
            <span
              className={
                item.direction === "down"
                  ? "flex items-center text-xs font-medium text-success"
                  : item.direction === "up"
                  ? "flex items-center text-xs font-medium text-magenta"
                  : "flex items-center text-xs text-muted-foreground"
              }
            >
              <Icon className="h-3 w-3" />
              {item.change}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function buildTimeline(
  weights: { date: string; weightKg: number }[],
  measurements: MeasurementEntryDTO[],
  prEvents: PrEventDTO[]
): TimelineItem[] {
  const items: TimelineItem[] = [];

  // PR events.
  for (const e of prEvents) {
    items.push({
      date: e.date,
      icon: "pr",
      title: e.exerciseName,
      value: `${formatNumber(e.weightKg)}kg × ${e.reps} reps`,
      change: e.type === "WEIGHT" ? "New maximum weight" : "New rep record",
      direction: "flat",
    });
  }

  // Weight changes (vs previous weigh-in).
  for (let i = 1; i < weights.length; i++) {
    const delta = weights[i].weightKg - weights[i - 1].weightKg;
    items.push({
      date: weights[i].date,
      icon: "weight",
      title: "Body weight",
      value: `${formatNumber(weights[i].weightKg)}kg`,
      change: delta !== 0 ? `${formatNumber(Math.abs(delta))}kg` : null,
      direction: delta < 0 ? "down" : delta > 0 ? "up" : "flat",
    });
  }

  // Measurement changes (vs previous reading of same type).
  const prevByType = new Map<string, number>();
  for (const m of measurements) {
    const prev = prevByType.get(m.typeId);
    if (prev !== undefined) {
      const delta = m.value - prev;
      items.push({
        date: m.date,
        icon: "measurement",
        title: m.typeName,
        value: formatMeasurement(m.value, m.unit),
        change:
          delta !== 0
            ? `${formatNumber(Math.abs(delta))}${
                m.unit === "INCH" ? '"' : "cm"
              }`
            : null,
        direction: delta < 0 ? "down" : delta > 0 ? "up" : "flat",
      });
    }
    prevByType.set(m.typeId, m.value);
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}
