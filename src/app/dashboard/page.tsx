import Link from "next/link";
import { ArrowRight, Dumbbell, MessageSquareText, Play, Sparkles, Target, Trophy, Weight } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { checkInService } from "@/lib/services/checkin";
import { gymService } from "@/lib/services/gym";
import { personalRecordService } from "@/lib/services/personalRecord";
import { programService } from "@/lib/services/program";
import { trainingProgressService } from "@/lib/services/trainingProgress";
import { weeklyReviewService } from "@/lib/services/weeklyReview";
import { workoutService } from "@/lib/services/workout";
import { analyticsService } from "@/lib/services/analytics";
import { todayIso } from "@/lib/dates";
import { prEventDetail } from "@/lib/analytics";
import { progressInsight } from "@/lib/violet-insights";
import { focusMessage, staleRecordFocus, type FocusItem } from "@/lib/pr-focus";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PATIENT_LABEL } from "@/lib/constants";
import { showsOwnerUi } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { TodayCard } from "@/components/programs/today-card";
import { FadeIn } from "@/components/motion/fade-in";
import type { PrEventDTO } from "@/lib/services/personalRecord";
import type { ExerciseProgress } from "@/lib/training-analytics";
import type { WorkoutListItemDTO } from "@/lib/services/workout";

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const caption = "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground";

/**
 * Home: the gym-progress command centre. Priority order: today's workout, the
 * latest PR, strength trend, the latest WhatsApp import, this week, Violet.
 * Body, recovery and the gym map are one compact row at the bottom.
 */
export default async function DashboardOverviewPage() {
  const viewer = await requireAuth();
  const showsOwner = showsOwnerUi(viewer.role);
  // Start workout / import are write flows: the athlete only.
  const canAct = viewer.role === "OWNER";

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

  const today = todayIso();
  const [todayWorkout, prEvents, training, week, sessions, analytics, weights, recovery, journey] = await Promise.all([
    programService.today(),
    personalRecordService.prEvents(),
    trainingProgressService.get("week"),
    weeklyReviewService.get(today),
    workoutService.listSessions(40, { includeIncomplete: true }),
    analyticsService.get("3M"),
    bodyWeightService.list(),
    checkInService.overview(today, 30),
    gymService.getJourney().catch(() => null),
  ]);

  const latestPr = prEvents[0] ?? null;
  const focus = staleRecordFocus(training.series, prEvents);
  const latestImport = sessions.find((s) => s.fromWhatsApp) ?? null;
  const insight = progressInsight(analytics.e1rmTrends, analytics.consistency.pct);
  const lastWeight = weights[weights.length - 1];
  const hasData = prEvents.length > 0 || training.exercises.length > 0 || sessions.length > 0 || weights.length > 0;

  return (
    <div className="space-y-6">
      <div>
        {showsOwner ? (
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
            <p className="mt-1 text-sm font-medium text-muted-foreground">Progress overview</p>
          </>
        )}
      </div>

      {canAct && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-14 text-base font-semibold">
            <Link href="/dashboard/workout">
              <Play className="h-5 w-5" /> Start workout
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-14 text-base font-semibold">
            <Link href="/dashboard/import">
              <MessageSquareText className="h-5 w-5" /> Import WhatsApp
            </Link>
          </Button>
        </div>
      )}

      {!hasData ? (
        <EmptyState
          icon={Dumbbell}
          title={showsOwner ? "No training recorded yet" : "No progress recorded yet"}
          description={
            showsOwner
              ? "Start a workout, or import a WhatsApp update to record your first PRs."
              : "The athlete's progress will appear here once they add data."
          }
          action={canAct ? <ImportWorkoutButton label="Import WhatsApp" /> : undefined}
        />
      ) : (
        <FadeIn>
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              {todayWorkout ? (
                <TodayCard today={todayWorkout} canStart={canAct} />
              ) : (
                <Card className="flex flex-col justify-between gap-3 p-5">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Today</p>
                    <h2 className="mt-1 text-2xl font-bold tracking-tight">{showsOwner ? "Ready when you are" : "No workout planned"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {showsOwner ? "Start a workout or pick a program." : "Nothing scheduled from the active program."}
                    </p>
                  </div>
                  {canAct && (
                    <Button asChild variant="outline" className="w-fit">
                      <Link href="/dashboard/programs">Programs</Link>
                    </Button>
                  )}
                </Card>
              )}
              <LatestPrCard pr={latestPr} />
            </div>

            {focus.length > 0 && <FocusCard items={focus} />}

            <div className="grid gap-4 lg:grid-cols-2">
              <StrengthTrendCard exercises={training.exercises} />
              <WeekCard
                workouts={week.training.workouts}
                planned={week.consistency.planned}
                progressUpdates={week.training.progressUpdates}
                prs={week.strength.prs.length}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <LatestImportCard item={latestImport} canImport={canAct} />
              <Card className="space-y-2 border-primary/30 bg-primary/5 p-5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Violet
                </p>
                <p className="text-base font-medium">
                  {insight ?? "Keep recording your lifts. Violet needs a few more recorded sessions to spot a trend."}
                </p>
                <Link
                  href={showsOwner ? "/dashboard/coach" : "/dashboard/review"}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {showsOwner ? "Ask Violet" : "Weekly review"} <ArrowRight className="h-4 w-4" />
                </Link>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MiniLink href="/dashboard/weight" label="Body weight">
                {lastWeight ? `${formatNumber(lastWeight.weightKg)} kg` : "No weigh-ins"}
              </MiniLink>
              <MiniLink href="/dashboard/recovery" label="Recovery">
                {recovery.today?.readiness ? `${recovery.today.readiness.score}/100` : "Check in"}
              </MiniLink>
              <MiniLink href="/dashboard/gym" label="Gym journey">
                {journey?.stats.uniqueVisited ?? 0} gym{journey?.stats.uniqueVisited === 1 ? "" : "s"}
              </MiniLink>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

function MiniLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <Card className="h-full space-y-0.5 p-3 transition-shadow hover:shadow-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{children}</p>
      </Card>
    </Link>
  );
}

/** Reminder: the lift that has gone longest without a PR (recorded data only). */
function FocusCard({ items }: { items: FocusItem[] }) {
  const [top, ...rest] = items;
  return (
    <Card className="space-y-3 border-magenta/30 bg-magenta/5 p-5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-magenta">
        <Target className="h-3.5 w-3.5" /> Focus next
      </p>
      <div className="space-y-1">
        <Link href={`/dashboard/exercises/${top.exerciseId}`} className="text-lg font-semibold hover:underline">
          {top.name}
        </Link>
        <p className="text-sm text-muted-foreground">{focusMessage(top)}</p>
      </div>
      {rest.length > 0 && (
        <ul className="space-y-1 border-t pt-3 text-sm">
          {rest.map((f) => (
            <li key={f.exerciseId} className="flex items-center justify-between gap-3">
              <Link href={`/dashboard/exercises/${f.exerciseId}`} className="truncate font-medium hover:underline">
                {f.name}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">{f.daysSincePr} days without a PR</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Based on your recorded sessions only.</p>
    </Card>
  );
}

function LatestPrCard({ pr }: { pr: PrEventDTO | null }) {
  const d = pr ? prEventDetail(pr) : null;
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
      <p className={caption}>
        <Trophy className="h-3.5 w-3.5 text-magenta" /> Latest PR
      </p>
      {pr && d ? (
        <div className="mt-2 space-y-1">
          <p className="text-lg font-semibold">{pr.exerciseName}</p>
          <p className="text-3xl font-bold tabular-nums">
            {formatNumber(pr.weightKg)} kg{pr.assisted ? " assistance" : ""} × {pr.reps}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full bg-brand-gradient px-2.5 py-0.5 text-xs font-semibold text-white">🏆 {d.label.toUpperCase()}</span>
            <span className="text-xs font-medium">{d.detail}</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatDate(pr.date)}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No personal records yet. Record a few lifts to start tracking PRs.</p>
      )}
    </Card>
  );
}

const TREND: Record<ExerciseProgress["status"], { icon: string; tone: string; label: string } | null> = {
  progressing: { icon: "↑", tone: "text-success", label: "Improving" },
  stalled: { icon: "→", tone: "text-muted-foreground", label: "Steady" },
  regressing: { icon: "↓", tone: "text-magenta", label: "Down" },
  new: { icon: "•", tone: "text-primary", label: "New" },
  inactive: null,
};

function StrengthTrendCard({ exercises }: { exercises: ExerciseProgress[] }) {
  const rows = exercises
    .filter((e) => TREND[e.status])
    .sort((a, b) => b.lastPerformed.localeCompare(a.lastPerformed))
    .slice(0, 6);
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <p className={caption}>
          <Dumbbell className="h-3.5 w-3.5 text-primary" /> Strength trend
        </p>
        <Link href="/dashboard/strength" className="text-xs font-medium text-primary hover:underline">
          All exercises
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Trends appear after a few recorded sessions of an exercise.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((e) => {
            const t = TREND[e.status]!;
            return (
              <li key={e.exerciseId} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{e.name}</span>
                <span className={cn("flex items-center gap-1.5 font-semibold", t.tone)} title={t.label}>
                  <span className="text-xs font-normal">{t.label}</span>
                  <span className="w-4 text-center text-base leading-none">{t.icon}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Based on your recorded sessions. Lower assistance counts as stronger.</p>
    </Card>
  );
}

function WeekCard({ workouts, planned, progressUpdates, prs }: { workouts: number; planned: number; progressUpdates: number; prs: number }) {
  return (
    <Link href="/dashboard/review">
      <Card className="h-full space-y-2 p-5 transition-shadow hover:shadow-md">
        <p className={caption}>This week</p>
        <p className="text-4xl font-bold tabular-nums">
          {workouts}
          <span className="ml-1.5 text-base font-medium text-muted-foreground">
            workout{workouts === 1 ? "" : "s"}
            {planned > 0 ? ` of ${planned} planned` : ""}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {prs > 0 ? `${prs} PR${prs === 1 ? "" : "s"}` : "No PRs yet"}
          {progressUpdates > 0 ? ` · ${progressUpdates} progress update${progressUpdates === 1 ? "" : "s"} logged` : ""}
        </p>
      </Card>
    </Link>
  );
}

const IMPORT_KIND: Record<string, string> = { COMPLETED: "Full workout", PARTIAL: "Partial workout", PR_UPDATE: "PR / progress update" };

function LatestImportCard({ item, canImport }: { item: WorkoutListItemDTO | null; canImport: boolean }) {
  return (
    <Card className="space-y-2 p-5">
      <p className={caption}>
        <MessageSquareText className="h-3.5 w-3.5 text-primary" /> Latest WhatsApp import
      </p>
      {item ? (
        <>
          <p className="font-semibold">{item.exercises.slice(0, 3).join(", ") || "Imported sets"}</p>
          <p className="text-sm text-muted-foreground">
            {IMPORT_KIND[item.status] ?? "Import"} · {item.sets} set{item.sets === 1 ? "" : "s"} recorded · {formatDate(item.date)}
          </p>
          <Link href="/dashboard/workouts?show=whatsapp" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            See imports <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {canImport ? "Paste a WhatsApp update to record PRs in seconds." : "No WhatsApp imports yet."}
          </p>
          {canImport && (
            <Link href="/dashboard/import" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Import WhatsApp <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </>
      )}
    </Card>
  );
}
