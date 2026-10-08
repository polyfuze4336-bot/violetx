import { GitCompareArrows } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { measurementService } from "@/lib/services/measurement";
import { exerciseEntryService } from "@/lib/services/exercise";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  CompareClient,
  type BodySeries,
  type StrengthSeries,
} from "@/components/compare/compare-client";

function unitLabel(unit: string) {
  return unit === "INCH" ? "in" : "cm";
}

export default async function ComparePage() {
  const viewer = await requireAuth();

  const [weights, measurements, sets] = viewer.athleteId
    ? await Promise.all([
        bodyWeightService.list(),
        measurementService.listEntries(),
        exerciseEntryService.list(),
      ])
    : [[], [], []];

  const bodySeries: BodySeries[] = [];
  if (weights.length > 0) {
    bodySeries.push({
      name: "Weight",
      unit: "kg",
      points: weights.map((w) => ({ date: w.date, value: w.weightKg })),
    });
  }
  const measByType = new Map<string, BodySeries>();
  for (const m of measurements) {
    let s = measByType.get(m.typeName);
    if (!s) {
      s = { name: m.typeName, unit: unitLabel(m.unit), points: [] };
      measByType.set(m.typeName, s);
    }
    s.unit = unitLabel(m.unit);
    s.points.push({ date: m.date, value: m.value });
  }
  bodySeries.push(...Array.from(measByType.values()));

  // Sets come back descending; group ascending per exercise.
  const strengthMap = new Map<string, StrengthSeries>();
  for (const e of [...sets].reverse()) {
    let s = strengthMap.get(e.exerciseName);
    if (!s) {
      s = { name: e.exerciseName, assisted: e.assisted, points: [] };
      strengthMap.set(e.exerciseName, s);
    }
    s.points.push({ date: e.date, weightKg: e.weightKg, reps: e.reps });
  }
  const strengthSeries = Array.from(strengthMap.values());

  const allDates = [
    ...weights.map((w) => w.date),
    ...measurements.map((m) => m.date),
    ...sets.map((s) => s.date),
  ].sort();
  const minDate = allDates[0]?.slice(0, 10) ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compare"
        description="See how far you've come between a start date and now."
      />

      {bodySeries.length === 0 && strengthSeries.length === 0 ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Not enough data to compare"
          description="Add some measurements or training sets first."
        />
      ) : (
        <CompareClient
          bodySeries={bodySeries}
          strengthSeries={strengthSeries}
          minDate={minDate}
        />
      )}
    </div>
  );
}
