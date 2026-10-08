import { Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { personalRecordService } from "@/lib/services/personalRecord";
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

export default async function ExercisesPage() {
  const viewer = await requireAuth();
  const isOwner = viewer.role === "OWNER";

  const [exercises, prs] = viewer.athleteId
    ? await Promise.all([
        exerciseService.list(),
        personalRecordService.list(),
      ])
    : [[], []];

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
