import { prisma } from "@/lib/db";
import { requireOwnerAthlete } from "@/lib/services/context";
import { NotFoundError } from "@/lib/rbac";
import { STARTER_EXERCISES, starterCreateData } from "@/lib/exercise-library";
import {
  buildMatchSources,
  exerciseIdentityKeys,
  matchExercise,
  parseExerciseRef,
} from "@/lib/exercise-matching";
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

interface LibraryRow {
  id: string;
  name: string;
  aliases: string | null;
}

const MAX_ALIASES_LENGTH = 400;

/**
 * Find the library exercise a set refers to WITHOUT creating anything: a
 * confirmed ref first, otherwise an exact name/alias match. Fuzzy corrections
 * are only ever applied when the user confirmed them (exerciseRef).
 */
function findLibraryExercise(
  library: LibraryRow[],
  set: { exercise: string; exerciseRef?: string }
): LibraryRow | null {
  const ref = parseExerciseRef(set.exerciseRef);
  if (ref?.kind === "id") return library.find((l) => l.id === ref.id) ?? null;
  if (ref?.kind === "starter") {
    const starter = STARTER_EXERCISES.find((s) => s.name === ref.name);
    if (!starter) return null;
    const keys = new Set(exerciseIdentityKeys(starter.name, starter.aliases));
    return library.find((l) => exerciseIdentityKeys(l.name, l.aliases).some((k) => keys.has(k))) ?? null;
  }
  const m = matchExercise(set.exercise, buildMatchSources(library, []));
  const hit = m.status === "EXACT" ? parseExerciseRef(m.candidates[0].ref) : null;
  return hit?.kind === "id" ? (library.find((l) => l.id === hit.id) ?? null) : null;
}

/**
 * Resolve the exercise for one imported set, creating it only when needed:
 *  1. a ref the user confirmed (validated against the athlete's library / the
 *     canonical starter list; it can never be an arbitrary id),
 *  2. an exact name or alias match (so "Lat Pull Down" never duplicates "Lat Pulldown"),
 *  3. otherwise a new custom exercise with the name as typed.
 * Historical sets are never rewritten. A confirmed correction is remembered as
 * an alias so the same spelling resolves exactly next time.
 */
async function resolveExerciseForCommit(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  athleteId: string,
  library: LibraryRow[],
  set: { exercise: string; exerciseRef?: string },
  newExercises: string[]
): Promise<LibraryRow> {
  const typed = set.exercise.trim();
  const ref = parseExerciseRef(set.exerciseRef);
  if (set.exerciseRef && !ref) throw new NotFoundError("That exercise suggestion is not valid. Review the import again.");

  const row = findLibraryExercise(library, set);
  if (ref?.kind === "id" && !row) {
    throw new NotFoundError("A selected exercise no longer exists. Review the import again.");
  }

  if (!row) {
    let starter = ref?.kind === "starter" ? STARTER_EXERCISES.find((s) => s.name === ref.name) : undefined;
    if (ref?.kind === "starter" && !starter) throw new NotFoundError("That exercise suggestion is not valid. Review the import again.");
    if (!ref) {
      const m = matchExercise(typed, buildMatchSources([], STARTER_EXERCISES));
      const hit = m.status === "EXACT" ? parseExerciseRef(m.candidates[0].ref) : null;
      if (hit?.kind === "starter") starter = STARTER_EXERCISES.find((s) => s.name === hit.name);
    }
    const created = await tx.exercise.create({
      data: starter
        ? { athleteId, ...starterCreateData(starter, ref && exerciseIdentityKeys(typed)[0] !== exerciseIdentityKeys(starter.name)[0] ? typed : undefined) }
        : { athleteId, name: typed },
      select: { id: true, name: true, aliases: true },
    });
    newExercises.push(created.name);
    library.push(created);
    return created;
  }

  // Remember a confirmed spelling as an alias (unless another exercise owns it).
  const key = exerciseIdentityKeys(typed)[0];
  if (ref && key) {
    const own = new Set(exerciseIdentityKeys(row.name, row.aliases));
    const taken = library.some((l) => l.id !== row!.id && exerciseIdentityKeys(l.name, l.aliases).includes(key));
    const next = [row.aliases, typed].filter(Boolean).join(", ");
    if (!own.has(key) && !taken && next.length <= MAX_ALIASES_LENGTH) {
      await tx.exercise.update({ where: { id: row.id }, data: { aliases: next } });
      row.aliases = next;
    }
  }
  return row;
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

    const library = await prisma.exercise.findMany({
      where: { athleteId },
      select: { id: true, name: true, aliases: true },
    });
    const exerciseIds = new Map<string, string | null>();
    const sets: boolean[] = [];
    for (const s of data.sets) {
      const key = `${s.exerciseRef ?? ""}|${exerciseIdentityKeys(s.exercise)[0] ?? s.exercise}`;
      if (!exerciseIds.has(key)) {
        exerciseIds.set(key, findLibraryExercise(library, s)?.id ?? null);
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
    // Exercises loaded once per import; grows as exercises are created.
    const library: LibraryRow[] = [];

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

      library.push(
        ...(await tx.exercise.findMany({
          where: { athleteId },
          select: { id: true, name: true, aliases: true },
        }))
      );

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
        const exerciseKey = `${set.exerciseRef ?? ""}|${exerciseIdentityKeys(set.exercise)[0] ?? set.exercise}`;
        let exercise = exerciseCache.get(exerciseKey);
        if (!exercise) {
          exercise = await resolveExerciseForCommit(tx, athleteId, library, set, summary.newExercises);
          exerciseCache.set(exerciseKey, exercise);
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
