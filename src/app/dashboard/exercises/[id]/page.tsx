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

  const { exercise, currentBest, assisted } = detail;
  const unit = assisted ? "kg assistance" : "kg";

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
              {currentBest.weightKg} {unit} × {currentBest.reps}
            </p>
            {assisted && <p className="text-xs text-muted-foreground">Lowest assistance · lower = stronger</p>}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label={assisted ? "Lowest assistance" : "Maximum weight"}
          value={
            detail.maxWeight
              ? `${detail.maxWeight.weightKg} ${unit} × ${detail.maxWeight.reps}`
              : "—"
          }
          sub={detail.maxWeight ? formatDate(detail.maxWeight.date) : undefined}
        />
        <StatTile
          label="Maximum reps"
          value={
            detail.maxReps
              ? `${detail.maxReps.reps} × ${detail.maxReps.weightKg} ${unit}`
              : "—"
          }
          sub={detail.maxReps ? formatDate(detail.maxReps.date) : undefined}
        />
        {!assisted && (
          <StatTile
            label="Estimated strength"
            value={
              detail.maxEstStrength ? `${detail.maxEstStrength.value} kg` : "—"
            }
            sub="Analytical (Epley) — not an actual 1RM"
            accent
          />
        )}
        <StatTile label="Latest performance" perf={detail.latest} unit={unit} />
        <StatTile label="Best performance" perf={detail.best} unit={unit} />
        <StatTile
          label="Total sessions"
          value={String(detail.totalSessions)}
          sub={`${detail.totalSets} set${detail.totalSets === 1 ? "" : "s"} total`}
        />
      </div>

      {detail.latestProgression && (
        <Card className="grid gap-3 p-5 sm:grid-cols-2">
          {detail.latestProgression.load && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {assisted ? "Assistance progression" : "Load progression"}
              </p>
              <p className="text-xl font-bold tabular-nums">
                {detail.latestProgression.load.fromKg} → {detail.latestProgression.load.toKg} {unit}
              </p>
              <p className="text-sm font-semibold text-success">
                {assisted
                  ? `↓ ${detail.latestProgression.load.deltaKg} kg less assistance`
                  : `↑ ${detail.latestProgression.load.deltaKg} kg`}
              </p>
              {detail.latestProgression.load.topReps && (
                <p className="text-sm font-semibold text-success">
                  ↑ {detail.latestProgression.load.topReps.delta} rep{detail.latestProgression.load.topReps.delta === 1 ? "" : "s"} ({detail.latestProgression.load.topReps.from} → {detail.latestProgression.load.topReps.to})
                </p>
              )}
            </div>
          )}
          {detail.latestProgression.reps && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Rep progression @ {detail.latestProgression.reps.weightKg} {unit}
              </p>
              <p className="text-xl font-bold tabular-nums">
                {detail.latestProgression.reps.from} → {detail.latestProgression.reps.to} reps
              </p>
              <p className="text-sm font-semibold text-success">
                ↑ {detail.latestProgression.reps.delta} rep{detail.latestProgression.reps.delta === 1 ? "" : "s"} at {detail.latestProgression.reps.weightKg} {unit}
              </p>
            </div>
          )}
        </Card>
      )}

      <ExerciseProgression
        progression={detail.progression}
        history={detail.history}
        assisted={detail.assisted}
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
  unit = "kg",
}: {
  label: string;
  value?: string;
  sub?: string;
  perf?: PerformanceRef | null;
  accent?: boolean;
  unit?: string;
}) {
  const display = perf
    ? `${perf.weightKg} ${unit} × ${perf.reps}`
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
