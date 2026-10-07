import Link from "next/link";
import { ArrowRight, Dumbbell, HeartPulse, Map as MapIcon, Play, Sparkles, Target, Trophy } from "lucide-react";

import { analyticsService } from "@/lib/services/analytics";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { checkInService } from "@/lib/services/checkin";
import { goalService } from "@/lib/services/goal";
import { gymService } from "@/lib/services/gym";
import { personalRecordService } from "@/lib/services/personalRecord";
import { programService } from "@/lib/services/program";
import { weeklyReviewService } from "@/lib/services/weeklyReview";
import { todayIso } from "@/lib/dates";
import { progressInsight } from "@/lib/violet-insights";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { TodayCard } from "@/components/programs/today-card";
import { ReadinessGauge } from "@/components/recovery/readiness-gauge";

function Tile({ label, icon: Icon, children, href }: { label: string; icon: typeof Dumbbell; children: React.ReactNode; href?: string }) {
  const body = (
    <Card className="h-full space-y-1.5 p-4 transition-shadow hover:shadow-md">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </p>
      {children}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function WeekRing({ done, planned }: { done: number; planned: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = planned > 0 ? Math.min(1, done / planned) : done > 0 ? 1 : 0;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="stroke-primary" />
    </svg>
  );
}

/** "What should I do today / how am I progressing / how recovered am I / what did Violet notice". */
export async function HomeHero({ isOwner }: { isOwner: boolean }) {
  const today = todayIso();
  const [todayWorkout, recovery, week, weights, analytics, journey, goals, prEvents] = await Promise.all([
    programService.today(),
    checkInService.overview(today, 30),
    weeklyReviewService.get(today),
    bodyWeightService.list(),
    analyticsService.get("3M"),
    gymService.getJourney().catch(() => null),
    goalService.active(),
    personalRecordService.prEvents(),
  ]);

  const lastW = weights[weights.length - 1];
  const prevW = weights[weights.length - 2];
  const weightDelta = lastW && prevW ? Math.round((lastW.weightKg - prevW.weightKg) * 10) / 10 : null;
  const lift = analytics.e1rmTrends[0];
  const liftLatest = lift?.points[lift.points.length - 1]?.e1rm;
  const insight = progressInsight(analytics.e1rmTrends, analytics.consistency.pct);
  const pr = prEvents[0] ?? null;
  const readiness = recovery.today?.readiness ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {todayWorkout ? (
          <TodayCard today={todayWorkout} canStart={isOwner} />
        ) : (
          <Card className="flex flex-col justify-between gap-3 p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Today</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">{isOwner ? "Ready when you are" : "No workout planned"}</h2>
              <p className="text-sm text-muted-foreground">{isOwner ? "Start a workout or set up a program." : "Nothing scheduled from the active program."}</p>
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-2">
                <Button asChild className="h-12 text-base font-semibold">
                  <Link href="/dashboard/workout">
                    <Play className="h-4 w-4" /> Start workout
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-12">
                  <Link href="/dashboard/programs">Programs</Link>
                </Button>
              </div>
            )}
          </Card>
        )}

        <Card className="p-5">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            <HeartPulse className="h-3.5 w-3.5" /> Readiness
          </p>
          {readiness ? (
            <ReadinessGauge readiness={readiness} compact />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">No check-in today.</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/recovery">{isOwner ? "Check in" : "Recovery"}</Link>
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="This week" icon={Dumbbell} href="/dashboard/review">
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold tabular-nums">
              {week.consistency.done}
              {week.consistency.planned > 0 && <span className="text-base font-medium text-muted-foreground"> / {week.consistency.planned}</span>}
            </p>
            <WeekRing done={week.consistency.done} planned={week.consistency.planned} />
          </div>
          <p className="text-xs text-muted-foreground">workouts</p>
        </Tile>

        <Tile label="Weight" icon={Target} href="/dashboard/weight">
          <p className="text-3xl font-bold tabular-nums">
            {lastW ? formatNumber(lastW.weightKg) : "—"}
            {lastW && <span className="ml-1 text-sm font-medium text-muted-foreground">kg</span>}
          </p>
          {weightDelta !== null && (
            <p className={cn("text-xs font-semibold", weightDelta <= 0 ? "text-success" : "text-magenta")}>
              {weightDelta <= 0 ? "↓" : "↑"} {Math.abs(weightDelta)} kg
            </p>
          )}
          <Sparkline values={weights.slice(-12).map((w) => w.weightKg)} height={28} color={2} />
        </Tile>

        <Tile label="Strength" icon={Trophy} href="/dashboard/analytics">
          {lift && liftLatest ? (
            <>
              <p className="text-xs text-muted-foreground">{lift.name} est. 1RM</p>
              <p className="text-3xl font-bold tabular-nums">
                {formatNumber(liftLatest)}
                <span className="ml-1 text-sm font-medium text-muted-foreground">kg</span>
              </p>
              {lift.changePct !== null && (
                <p className={cn("text-xs font-semibold", lift.changePct >= 0 ? "text-success" : "text-magenta")}>
                  {lift.changePct >= 0 ? "↑" : "↓"} {Math.abs(lift.changePct)}%
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No lifts yet</p>
          )}
        </Tile>

        <Tile label="Gym journey" icon={MapIcon} href="/dashboard/gym">
          <p className="text-3xl font-bold tabular-nums">{journey?.stats.uniqueVisited ?? 0}</p>
          <p className="text-xs text-muted-foreground">gym{journey?.stats.uniqueVisited === 1 ? "" : "s"} explored</p>
        </Tile>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 border-primary/30 bg-primary/5 p-5 lg:col-span-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Violet insight
          </p>
          <p className="text-base font-medium">{insight ?? "Keep logging — Violet needs a few more sessions to spot a trend."}</p>
          <Link href="/dashboard/review" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Weekly review <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>

        <Card className="space-y-2 p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 text-primary" /> Recent PR
          </p>
          {pr ? (
            <>
              <p className="font-semibold">{pr.exerciseName}</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatNumber(pr.weightKg)} kg × {pr.reps}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No PRs yet.</p>
          )}
        </Card>
      </div>

      {goals.length > 0 && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-primary" /> Goals
            </p>
            <Link href="/dashboard/goals" className="text-sm font-medium text-primary hover:underline">
              All goals
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {goals.slice(0, 4).map((g) => (
              <div key={g.id} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="truncate font-medium">{g.title}</span>
                  <span className="tabular-nums text-muted-foreground">{g.progress.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", g.progress.achieved ? "bg-success" : "bg-brand-gradient")} style={{ width: `${g.progress.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
