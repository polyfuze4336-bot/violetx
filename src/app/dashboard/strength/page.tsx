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

/** Reduce a set list to the heaviest set per date for a progression chart. */
function maxWeightPerDate(entries: ExerciseEntryDTO[]) {
  const byDate = new Map<string, number>();
  for (const e of entries) {
    const key = e.date.slice(0, 10);
    byDate.set(key, Math.max(byDate.get(key) ?? 0, e.weightKg));
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
  const isOwner = viewer.role === "OWNER";

  const [exercises, entries] = viewer.athleteId
    ? await Promise.all([
        exerciseService.list(),
        exerciseEntryService.list(),
      ])
    : [[], []];

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
                const chartData = maxWeightPerDate(list);
                const best = Math.max(...list.map((s) => s.weightKg));
                return (
                  <Card key={ex.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        <span>{ex.name}</span>
                        <span className="text-sm font-normal text-muted-foreground">
                          best {best} kg
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ProgressLineChart
                        data={chartData}
                        xKey="label"
                        unit="kg"
                        height={200}
                        series={[
                          {
                            key: "weight",
                            name: "Top set",
                            color: (i % 5) + 1,
                          },
                        ]}
                      />
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Set history</CardTitle>
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
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.date)}</TableCell>
                      <TableCell>{e.exerciseName}</TableCell>
                      <TableCell className="font-medium">
                        {e.reps} × {e.weightKg} kg
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
