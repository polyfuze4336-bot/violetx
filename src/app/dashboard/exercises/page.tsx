import Link from "next/link";
import { Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { personalRecordService } from "@/lib/services/personalRecord";
import { formatDate } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { ExerciseManager } from "@/components/settings/exercise-manager";

export default async function ExercisesPage() {
  const viewer = await requireAuth();
  const isOwner = viewer.role === "OWNER";

  const [exercises, prs] = viewer.athleteId
    ? await Promise.all([
        exerciseService.list(),
        personalRecordService.list(),
      ])
    : [[], []];

  const prByExercise = new Map(prs.map((r) => [r.exerciseId, r]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exercises"
        description="Your exercise library and how each lift is progressing."
      />

      {exercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={isOwner ? "No exercises yet" : "No exercises recorded yet"}
          description={
            isOwner
              ? "Add your first exercise below, or import a WhatsApp workout to create them automatically."
              : "The athlete's exercises will appear here once they start training."
          }
          action={isOwner ? <ImportWorkoutButton /> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => {
            const pr = prByExercise.get(ex.id);
            const meta = [ex.category, ex.muscleGroup].filter(Boolean).join(" · ");
            return (
              <Link
                key={ex.id}
                href={`/dashboard/exercises/${ex.id}`}
                className="group"
              >
                <Card className="h-full p-5 transition-shadow group-hover:shadow-[0_2px_4px_rgba(20,12,40,0.05),0_16px_40px_-20px_rgba(20,12,40,0.20)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{ex.name}</h3>
                      {meta && (
                        <p className="text-xs text-muted-foreground">{meta}</p>
                      )}
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Dumbbell className="h-[18px] w-[18px]" />
                    </div>
                  </div>
                  {pr ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Best weight
                        </p>
                        <p className="text-lg font-bold tabular-nums">
                          {pr.maxWeightKg}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            kg
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Est. 1RM
                        </p>
                        <p className="text-lg font-bold tabular-nums text-magenta">
                          {pr.estimatedOneRepMaxKg}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            kg
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Total sets
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {pr.totalSets}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Last done
                        </p>
                        <p className="text-sm font-semibold">
                          {formatDate(pr.lastPerformed)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      No sets recorded yet.
                    </p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {isOwner && (
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
