import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { requireViewerAthlete } from "@/lib/services/context";
import { derivePrEvents } from "@/lib/services/personalRecord";
import { isAssistedExercise } from "@/lib/progression-type";
import { toNumber } from "@/lib/dto";
import { PATIENT_LABEL } from "@/lib/constants";
import { buildProgressReport, type ProgressReport } from "@/lib/progress-report";
import { renderProgressPdf } from "@/lib/progress-pdf";

/** Read-only: the athlete, a coach and the demo viewer may all export what they can already see. */
export const progressReportService = {
  async build(options: { exerciseId?: string } = {}, now: Date = new Date()): Promise<ProgressReport> {
    const { athleteId } = await requireViewerAthlete();
    const entries = await exerciseEntryRepository.list(athleteId);
    const working = entries.filter((e) => e.setType !== "WARMUP");
    return buildProgressReport({
      athleteLabel: PATIENT_LABEL,
      exerciseId: options.exerciseId,
      now,
      prEvents: derivePrEvents(entries),
      sets: working.map((e) => ({
        date: e.date.toISOString(),
        exerciseId: e.exerciseId,
        exerciseName: e.exercise?.name ?? "",
        weightKg: toNumber(e.weightKg),
        reps: e.reps,
        assisted: isAssistedExercise({ name: e.exercise?.name, equipment: e.exercise?.equipment }),
        source: e.source,
      })),
    });
  },

  async pdf(options: { exerciseId?: string } = {}, now: Date = new Date()): Promise<{ bytes: Uint8Array; filename: string }> {
    const report = await this.build(options, now);
    return { bytes: await renderProgressPdf(report), filename: `violetx-progress-${report.generatedOn}.pdf` };
  },
};
