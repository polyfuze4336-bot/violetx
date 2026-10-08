import { Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseEntryService, exerciseService } from "@/lib/services/exercise";
import { deleteExerciseEntryAction } from "@/lib/actions/exercise";
import { formatDate, formatShortDate } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ImportWorkoutButton } from "@/components/dashboard/import-cta";
import { ConfirmDeleteButton } from "@/components/dashboard/delete-button";
import { ProgressLineChart } from "@/components/charts/line-chart";
import { SetForm } from "@/components/strength/set-form";
import type { ExerciseEntryDTO } from "@/lib/dto";
import { showsOwnerUi } from "@/lib/rbac";
import { isAssistedExercise } from "@/lib/progression-type";

// The set history is capped so the page stays fast with long histories.
const HISTORY_ROWS = 100;

/**
 * Reduce a set list to the best set per date for a progression chart: the
 * heaviest, or for assisted lifts (weight = assistance) the LOWEST assistance.
 */
function bestWeightPerDate(entries: ExerciseEntryDTO[], assisted: boolean) {
  const byDate = new Map<string, number>();
  for (const e of entries) {
    const key = e.date.slice(0, 10);
    const cur = byDate.get(key);
    byDate.set(key, cur === undefined ? e.weightKg : assisted ? Math.min(cur, e.weightKg) : Math.max(cur, e.weightKg));
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, weight]) => ({
      label: formatShortDate(date),
      weight,
    }));
}

export default async function StrengthPage() {
  const viewer = await requireAuth();
  const isOwner = showsOwnerUi(viewer.role);

  const [exercises, entries] = viewer.athleteId
    ? await Promise.all([
        exerciseService.list(),
        exerciseEntryService.list(),
      ])
    : [[], []];

  const assistedIds = new Set(exercises.filter(isAssistedExercise).map((e) => e.id));
  const byExercise = new Map<string, ExerciseEntryDTO[]>();
  for (const e of entries) {
    const list = byExercise.get(e.exerciseId) ?? [];
    list.push(e);
    byExercise.set(e.exerciseId, list);
  }

  return (
    <div>
      <PageHeader
        title="Strength progression"
        description="Weight and reps per exercise over time."
      />

      {isOwner && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Log a set</CardTitle>
          </CardHeader>
          <CardContent>
            <SetForm exercises={exercises} />
          </CardContent>
        </Card>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={isOwner ? "No strength data yet" : "No strength data recorded yet"}
          description={
            isOwner
              ? "Import your first WhatsApp workout update to start tracking your progression."
              : "Strength progression will appear here once the athlete records workouts."
          }
          action={isOwner ? <ImportWorkoutButton /> : undefined}
        />
      ) : (
        <>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            {exercises
              .filter((ex) => (byExercise.get(ex.id)?.length ?? 0) > 0)
              .map((ex, i) => {
                const list = byExercise.get(ex.id) ?? [];
                const assisted = isAssistedExercise(ex);
                const chartData = bestWeightPerDate(list, assisted);
                const best = assisted ? Math.min(...list.map((s) => s.weightKg)) : Math.max(...list.map((s) => s.weightKg));
                return (
                  <Card key={ex.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        <span>{ex.name}</span>
                        <span className="text-sm font-normal text-muted-foreground">
                          {assisted ? `lowest assistance ${best} kg` : `best ${best} kg`}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProgressLineChart
                        data={chartData}
                        xKey="label"
                        unit="kg"
                        height={200}
                        reverseY={assisted}
                        series={[
                          {
                            key: "weight",
                            name: assisted ? "Assistance" : "Top set",
                            color: (i % 5) + 1,
                          },
                        ]}
                      />
                      {assisted && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Lower assistance = stronger. The axis is flipped: higher on the chart means less assistance.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Set history</CardTitle>
              {entries.length > HISTORY_ROWS && (
                <p className="text-xs text-muted-foreground">Showing the latest {HISTORY_ROWS} of {entries.length} sets.</p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Exercise</TableHead>
                    <TableHead>Reps × Weight</TableHead>
                    {isOwner && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.slice(0, HISTORY_ROWS).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.date)}</TableCell>
                      <TableCell>{e.exerciseName}</TableCell>
                      <TableCell className="font-medium">
                        {e.reps} × {e.weightKg} kg{assistedIds.has(e.exerciseId) ? " assistance" : ""}
                      </TableCell>
                      {isOwner && (
                        <TableCell>
                          <ConfirmDeleteButton
                            onConfirm={deleteExerciseEntryAction.bind(
                              null,
                              e.id
                            )}
                            title="Delete this set?"
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
