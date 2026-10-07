import {
  exerciseEntryRepository,
  exerciseRepository,
} from "@/lib/repositories/exercise";
import { STARTER_EXERCISES, exerciseKeys } from "@/lib/exercise-library";
import { AuthorizationError, NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import {
  createExerciseEntrySchema,
  createExerciseSchema,
  updateExerciseEntrySchema,
  updateExerciseSchema,
  type CreateExerciseEntryInput,
  type CreateExerciseInput,
  type UpdateExerciseEntryInput,
  type UpdateExerciseInput,
} from "@/lib/schemas";
import {
  toExerciseDTO,
  toExerciseEntryDTO,
  type ExerciseDTO,
  type ExerciseEntryDTO,
} from "@/lib/dto";

export const exerciseService = {
  async list(): Promise<ExerciseDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await exerciseRepository.list(athleteId);
    return rows.map(toExerciseDTO);
  },

  async getById(id: string): Promise<ExerciseDTO | null> {
    const { athleteId } = await requireViewerAthlete();
    const row = await exerciseRepository.getById(athleteId, id);
    return row ? toExerciseDTO(row) : null;
  },

  async create(input: CreateExerciseInput): Promise<ExerciseDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createExerciseSchema.parse(input);
    const existing = await exerciseRepository.findByName(athleteId, data.name);
    if (existing) {
      throw new AuthorizationError(
        `An exercise called "${data.name}" already exists.`
      );
    }
    const created = await exerciseRepository.create({
      athleteId,
      name: data.name,
      category: data.category ?? null,
      muscleGroup: data.muscleGroup ?? null,
      equipment: data.equipment ?? null,
      aliases: data.aliases ?? null,
      secondaryMuscles: data.secondaryMuscles ?? null,
      movementPattern: data.movementPattern ?? null,
      instructions: data.instructions ?? null,
      tips: data.tips ?? null,
      isCustom: true,
      active: data.active,
    });
    return toExerciseDTO(created);
  },

  async update(input: UpdateExerciseInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateExerciseSchema.parse(input);
    const count = await exerciseRepository.update(athleteId, data.id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category ?? null } : {}),
      ...(data.muscleGroup !== undefined
        ? { muscleGroup: data.muscleGroup ?? null }
        : {}),
      ...(data.equipment !== undefined
        ? { equipment: data.equipment ?? null }
        : {}),
      ...(data.aliases !== undefined ? { aliases: data.aliases ?? null } : {}),
      ...(data.secondaryMuscles !== undefined
        ? { secondaryMuscles: data.secondaryMuscles ?? null }
        : {}),
      ...(data.movementPattern !== undefined
        ? { movementPattern: data.movementPattern ?? null }
        : {}),
      ...(data.instructions !== undefined
        ? { instructions: data.instructions ?? null }
        : {}),
      ...(data.tips !== undefined ? { tips: data.tips ?? null } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    });
    if (count === 0) throw new NotFoundError("Exercise not found.");
  },

  /**
   * Add the starter library. Exercises that already exist (by name or alias,
   * case-insensitive) are left untouched, so history is never altered.
   */
  async seedStarterLibrary(): Promise<{ created: number; skipped: number }> {
    const { athleteId } = await requireOwnerAthlete();
    const existing = await exerciseRepository.list(athleteId);
    const taken = new Set(
      existing.flatMap((e) => exerciseKeys(e.name, e.aliases))
    );
    const category = (g: string) =>
      g === "Biceps" || g === "Triceps"
        ? "Arms"
        : g === "Quads" || g === "Hamstrings" || g === "Calves"
          ? "Legs"
          : g === "Glutes & Hips"
            ? "Glutes"
            : g;
    let created = 0;
    let skipped = 0;
    for (const ex of STARTER_EXERCISES) {
      const keys = exerciseKeys(ex.name, ex.aliases);
      if (keys.some((k) => taken.has(k))) {
        skipped += 1;
        continue;
      }
      await exerciseRepository.create({
        athleteId,
        name: ex.name,
        category: category(ex.primary),
        muscleGroup: ex.primary,
        equipment: ex.equipment,
        aliases: ex.aliases?.join(", ") ?? null,
        secondaryMuscles: ex.secondary?.join(", ") ?? null,
        movementPattern: ex.pattern,
        instructions: ex.instructions,
        tips: ex.tips ?? null,
        isCustom: false,
        active: true,
      });
      keys.forEach((k) => taken.add(k));
      created += 1;
    }
    return { created, skipped };
  },

  async delete(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const entryCount = await exerciseRepository.countEntries(athleteId, id);
    if (entryCount > 0) {
      throw new AuthorizationError(
        "Cannot delete an exercise that still has recorded sets. Delete its history first."
      );
    }
    const count = await exerciseRepository.delete(athleteId, id);
    if (count === 0) throw new NotFoundError("Exercise not found.");
  },
};

export const exerciseEntryService = {
  async list(options?: {
    exerciseId?: string;
    take?: number;
  }): Promise<ExerciseEntryDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await exerciseEntryRepository.list(athleteId, options);
    return rows.map(toExerciseEntryDTO);
  },

  async create(input: CreateExerciseEntryInput): Promise<ExerciseEntryDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createExerciseEntrySchema.parse(input);
    const exercise = await exerciseRepository.getById(
      athleteId,
      data.exerciseId
    );
    if (!exercise) throw new NotFoundError("Exercise not found.");
    const created = await exerciseEntryRepository.create({
      athleteId,
      exerciseId: data.exerciseId,
      sessionId: data.sessionId ?? null,
      date: data.date,
      reps: data.reps,
      weightKg: data.weightKg,
      sets: data.sets ?? null,
      position: data.position,
      note: data.note ?? null,
      source: "MANUAL",
    });
    return toExerciseEntryDTO({ ...created, exercise });
  },

  async update(input: UpdateExerciseEntryInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateExerciseEntrySchema.parse(input);
    const count = await exerciseEntryRepository.update(athleteId, data.id, {
      ...(data.exerciseId !== undefined ? { exerciseId: data.exerciseId } : {}),
      ...(data.date !== undefined ? { date: data.date } : {}),
      ...(data.reps !== undefined ? { reps: data.reps } : {}),
      ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
      ...(data.note !== undefined ? { note: data.note ?? null } : {}),
    });
    if (count === 0) throw new NotFoundError("Exercise set not found.");
  },

  async delete(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await exerciseEntryRepository.delete(athleteId, id);
    if (count === 0) throw new NotFoundError("Exercise set not found.");
  },
};
