import {
  exerciseEntryRepository,
  exerciseRepository,
} from "@/lib/repositories/exercise";
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
      ...(data.active !== undefined ? { active: data.active } : {}),
    });
    if (count === 0) throw new NotFoundError("Exercise not found.");
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
