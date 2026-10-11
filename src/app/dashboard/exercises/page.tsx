import { Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { personalRecordService } from "@/lib/services/personalRecord";
import { exerciseMatchService } from "@/lib/services/exerciseMatch";
import { ExerciseNameCleanup } from "@/components/exercises/exercise-name-cleanup";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExerciseManager } from "@/components/settings/exercise-manager";
import {
  ExerciseLibrary,
  type ExerciseStats,
} from "@/components/exercises/exercise-library";
import { showsOwnerUi } from "@/lib/rbac";

export default async function ExercisesPage() {
  const viewer = await requireAuth();
  const isOwner = showsOwnerUi(viewer.role);

  const [exercises, prs] = viewer.athleteId
    ? await Promise.all([
        exerciseService.list(),
        personalRecordService.list(),
      ])
    : [[], []];
  // Corrections change data, so only the athlete is offered them (not the demo viewer).
  const nameFixes = viewer.athleteId && viewer.role === "OWNER" ? await exerciseMatchService.reviewLibrary() : [];

  const stats: Record<string, ExerciseStats> = {};
  for (const r of prs) {
    stats[r.exerciseId] = {
      assisted: r.assisted,
      maxWeightKg: r.maxWeightKg,
      estimatedOneRepMaxKg: r.estimatedOneRepMaxKg,
      totalSets: r.totalSets,
      lastPerformed: r.lastPerformed,
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exercise library"
        description="Your exercises, muscles and personal history."
      />

      <ExerciseNameCleanup proposals={nameFixes} />

      {exercises.length === 0 && !isOwner ? (
        <EmptyState icon={Dumbbell} title="No exercises recorded yet" />
      ) : (
        <ExerciseLibrary exercises={exercises} stats={stats} isOwner={isOwner} />
      )}

      {isOwner && exercises.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage exercises</CardTitle>
          </CardHeader>
          <CardContent>
            <ExerciseManager exercises={exercises} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
