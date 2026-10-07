import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseDetailService } from "@/lib/services/exerciseDetail";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExerciseProgression } from "@/components/strength/exercise-progression";
import type { PerformanceRef } from "@/lib/services/exerciseDetail";

export default async function ExerciseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const viewer = await requireAuth();
  if (!viewer.athleteId) notFound();

  const detail = await exerciseDetailService.get(params.id);
  if (!detail) notFound();

  const { exercise, currentBest } = detail;

  const meta = [exercise.category, exercise.muscleGroup, exercise.equipment]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/exercises"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All exercises
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Dumbbell className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {exercise.name}
            </h1>
            {!exercise.active && <Badge variant="outline">Inactive</Badge>}
          </div>
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        </div>
        {currentBest && (
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current best
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {currentBest.weightKg} kg × {currentBest.reps}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Maximum weight"
          value={
            detail.maxWeight
              ? `${detail.maxWeight.weightKg} kg × ${detail.maxWeight.reps}`
              : "—"
          }
          sub={detail.maxWeight ? formatDate(detail.maxWeight.date) : undefined}
        />
        <StatTile
          label="Maximum reps"
          value={
            detail.maxReps
              ? `${detail.maxReps.reps} × ${detail.maxReps.weightKg} kg`
              : "—"
          }
          sub={detail.maxReps ? formatDate(detail.maxReps.date) : undefined}
        />
        <StatTile
          label="Estimated strength"
          value={
            detail.maxEstStrength ? `${detail.maxEstStrength.value} kg` : "—"
          }
          sub="Analytical (Epley) — not an actual 1RM"
          accent
        />
        <StatTile label="Latest performance" perf={detail.latest} />
        <StatTile label="Best performance" perf={detail.best} />
        <StatTile
          label="Total sessions"
          value={String(detail.totalSessions)}
          sub={`${detail.totalSets} set${detail.totalSets === 1 ? "" : "s"} total`}
        />
      </div>

      <ExerciseProgression
        progression={detail.progression}
        history={detail.history}
      />

      {(exercise.instructions || exercise.tips || exercise.aliases || exercise.secondaryMuscles) && (
        <Card className="space-y-3 p-5 text-sm">
          {exercise.secondaryMuscles && (
            <p>
              <span className="font-semibold">Also works: </span>
              {exercise.secondaryMuscles}
            </p>
          )}
          {exercise.aliases && (
            <p>
              <span className="font-semibold">Also called: </span>
              {exercise.aliases}
            </p>
          )}
          {exercise.instructions && <p className="text-muted-foreground">{exercise.instructions}</p>}
          {exercise.tips && (
            <p className="rounded-lg bg-primary/5 p-3">
              <span className="font-semibold">Tip: </span>
              {exercise.tips}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  perf,
  accent = false,
}: {
  label: string;
  value?: string;
  sub?: string;
  perf?: PerformanceRef | null;
  accent?: boolean;
}) {
  const display = perf
    ? `${perf.weightKg} kg × ${perf.reps}`
    : value ?? "—";
  const subtitle = perf ? formatDate(perf.date) : sub;
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={
          accent
            ? "mt-2 text-2xl font-bold tabular-nums text-magenta"
            : "mt-2 text-2xl font-bold tabular-nums"
        }
      >
        {display}
      </p>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </Card>
  );
}
