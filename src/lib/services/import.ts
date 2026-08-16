import { prisma } from "@/lib/db";
import { requireOwnerAthlete } from "@/lib/services/context";
import {
  commitImportSchema,
  findDuplicatesSchema,
  type CommitImportInput,
  type FindDuplicatesInput,
} from "@/lib/schemas";

export interface ImportSummary {
  importBatchId: string;
  weightRecorded: boolean;
  measurementsCreated: number;
  setsCreated: number;
  skipped: number;
  replaced: number;
  newMeasurementTypes: string[];
  newExercises: string[];
}

export interface DuplicateReport {
  weight: boolean;
  measurements: boolean[];
  sets: boolean[];
}

/** UTC day range [start, next) for matching same-day records. */
function dayRange(d: Date): { start: Date; next: Date } {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, next };
}

export const importService = {
  /**
   * Report which items already have a similar record on the same date, so the
   * review screen can warn about possible duplicates before saving.
   */
  async findDuplicates(input: FindDuplicatesInput): Promise<DuplicateReport> {
    const { athleteId } = await requireOwnerAthlete();
    const data = findDuplicatesSchema.parse(input);
    const { start, next } = dayRange(data.date);
    const onDay = { gte: start, lt: next };

    const weight =
      data.weightKg != null
        ? (await prisma.bodyWeightEntry.count({
            where: { athleteId, date: onDay },
          })) > 0
        : false;

    const measurements = await Promise.all(
      data.measurements.map(async (m) => {
        const type = await prisma.measurementType.findFirst({
          where: { athleteId, name: m.name },
        });
        if (!type) return false;
        return (
          (await prisma.measurementEntry.count({
            where: { athleteId, typeId: type.id, date: onDay },
          })) > 0
        );
      })
    );

    const sets = await Promise.all(
      data.sets.map(async (s) => {
        const ex = await prisma.exercise.findFirst({
          where: { athleteId, name: s.exercise },
        });
        if (!ex) return false;
        return (
          (await prisma.exerciseEntry.count({
            where: {
              athleteId,
              exerciseId: ex.id,
              reps: s.reps,
              weightKg: s.weightKg,
              date: onDay,
            },
          })) > 0
        );
      })
    );

    return { weight, measurements, sets };
  },

  /**
   * Persist a reviewed WhatsApp import in a single transaction. Each item can be
   * IMPORTed, SKIPped, or REPLACE (delete matching same-day records first).
   * Missing measurement types and exercises are created automatically.
   */
  async commit(input: CommitImportInput): Promise<ImportSummary> {
    const { athleteId, actor } = await requireOwnerAthlete();
    const data = commitImportSchema.parse(input);
    const { start, next } = dayRange(data.date);
    const onDay = { gte: start, lt: next };

    return prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          athleteId,
          createdById: actor.userId,
          rawText: data.rawText ?? "",
          sourceDate: data.date,
          status: "COMMITTED",
        },
      });

      const summary: ImportSummary = {
        importBatchId: batch.id,
        weightRecorded: false,
        measurementsCreated: 0,
        setsCreated: 0,
        skipped: 0,
        replaced: 0,
        newMeasurementTypes: [],
        newExercises: [],
      };

      if (data.weightKg != null && data.weightResolution !== "SKIP") {
        if (data.weightResolution === "REPLACE") {
          const del = await tx.bodyWeightEntry.deleteMany({
            where: { athleteId, date: onDay },
          });
          summary.replaced += del.count;
        }
        await tx.bodyWeightEntry.create({
          data: {
            athleteId,
            date: data.date,
            weightKg: data.weightKg,
            source: "WHATSAPP",
            importBatchId: batch.id,
          },
        });
        summary.weightRecorded = true;
      } else if (data.weightKg != null) {
        summary.skipped += 1;
      }

      // Group the day's imported sets under a session.
      const importedSets = data.sets.filter((s) => s.resolution !== "SKIP");
      let sessionId: string | null = null;
      if (importedSets.length > 0) {
        const session = await tx.workoutSession.create({
          data: { athleteId, date: data.date, importBatchId: batch.id },
        });
        sessionId = session.id;
      }

      for (const meas of data.measurements) {
        if (meas.resolution === "SKIP") {
          summary.skipped += 1;
          continue;
        }
        let type = await tx.measurementType.findFirst({
          where: { athleteId, name: meas.name },
        });
        if (!type) {
          type = await tx.measurementType.create({
            data: { athleteId, name: meas.name, defaultUnit: meas.unit },
          });
          summary.newMeasurementTypes.push(meas.name);
        }
        if (meas.resolution === "REPLACE") {
          const del = await tx.measurementEntry.deleteMany({
            where: { athleteId, typeId: type.id, date: onDay },
          });
          summary.replaced += del.count;
        }
        await tx.measurementEntry.create({
          data: {
            athleteId,
            typeId: type.id,
            date: data.date,
            value: meas.value,
            unit: meas.unit,
            source: "WHATSAPP",
            importBatchId: batch.id,
          },
        });
        summary.measurementsCreated += 1;
      }

      let position = 0;
      for (const set of data.sets) {
        if (set.resolution === "SKIP") {
          summary.skipped += 1;
          continue;
        }
        let exercise = await tx.exercise.findFirst({
          where: { athleteId, name: set.exercise },
        });
        if (!exercise) {
          exercise = await tx.exercise.create({
            data: { athleteId, name: set.exercise },
          });
          summary.newExercises.push(set.exercise);
        }
        if (set.resolution === "REPLACE") {
          const del = await tx.exerciseEntry.deleteMany({
            where: {
              athleteId,
              exerciseId: exercise.id,
              reps: set.reps,
              weightKg: set.weightKg,
              date: onDay,
            },
          });
          summary.replaced += del.count;
        }
        await tx.exerciseEntry.create({
          data: {
            athleteId,
            exerciseId: exercise.id,
            sessionId,
            date: data.date,
            reps: set.reps,
            weightKg: set.weightKg,
            source: "WHATSAPP",
            importBatchId: batch.id,
            position: position++,
          },
        });
        summary.setsCreated += 1;
      }

      return summary;
    });
  },
};
