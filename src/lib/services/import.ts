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

    // Sequential with per-name caches: a day can hold dozens of sets, and
    // firing them all at once exhausts the connection pool.
    const typeIds = new Map<string, string | null>();
    const measurements: boolean[] = [];
    for (const m of data.measurements) {
      const key = m.name.toLowerCase();
      if (!typeIds.has(key)) {
        const type = await prisma.measurementType.findFirst({
          where: { athleteId, name: m.name },
          select: { id: true },
        });
        typeIds.set(key, type?.id ?? null);
      }
      const typeId = typeIds.get(key);
      measurements.push(
        typeId
          ? (await prisma.measurementEntry.count({
              where: { athleteId, typeId, date: onDay },
            })) > 0
          : false
      );
    }

    const exerciseIds = new Map<string, string | null>();
    const sets: boolean[] = [];
    for (const s of data.sets) {
      const key = s.exercise.toLowerCase();
      if (!exerciseIds.has(key)) {
        const ex = await prisma.exercise.findFirst({
          where: { athleteId, name: s.exercise },
          select: { id: true },
        });
        exerciseIds.set(key, ex?.id ?? null);
      }
      const exerciseId = exerciseIds.get(key);
      sets.push(
        exerciseId
          ? (await prisma.exerciseEntry.count({
              where: {
                athleteId,
                exerciseId,
                reps: s.reps,
                weightKg: s.weightKg,
                date: onDay,
              },
            })) > 0
          : false
      );
    }

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

    // Resolve each type/exercise once per import instead of per row.
    const typeCache = new Map<string, { id: string }>();
    const exerciseCache = new Map<string, { id: string }>();

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
        const typeKey = meas.name.toLowerCase();
        let type =
          typeCache.get(typeKey) ??
          (await tx.measurementType.findFirst({
            where: { athleteId, name: meas.name },
          }));
        if (!type) {
          type = await tx.measurementType.create({
            data: { athleteId, name: meas.name, defaultUnit: meas.unit },
          });
          summary.newMeasurementTypes.push(meas.name);
        }
        typeCache.set(typeKey, type);
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
        const exerciseKey = set.exercise.toLowerCase();
        let exercise =
          exerciseCache.get(exerciseKey) ??
          (await tx.exercise.findFirst({
            where: { athleteId, name: set.exercise },
          }));
        if (!exercise) {
          exercise = await tx.exercise.create({
            data: { athleteId, name: set.exercise },
          });
          summary.newExercises.push(set.exercise);
        }
        exerciseCache.set(exerciseKey, exercise);
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
    }, { maxWait: 20_000, timeout: 60_000 });
  },

  /**
   * Record the AI audit trail for a committed import: provenance on the batch
   * plus one AIAction per approved proposal (who approved, confidence, payload).
   */
  async attachAiAudit(
    batchId: string,
    approvedById: string,
    provider: string,
    model: string | null,
    actions: { actionType: string; payload: unknown; confidence: number | null }[]
  ): Promise<void> {
    await requireOwnerAthlete();
    const approvedAt = new Date();
    await prisma.$transaction([
      prisma.importBatch.update({
        where: { id: batchId },
        data: { aiProvider: provider, model: model ?? undefined },
      }),
      ...actions.map((a) =>
        prisma.aIAction.create({
          data: {
            importBatchId: batchId,
            actionType: a.actionType,
            payload: JSON.stringify(a.payload),
            confidence: a.confidence,
            status: "APPROVED",
            approvedById,
            approvedAt,
          },
        })
      ),
    ]);
  },
};
