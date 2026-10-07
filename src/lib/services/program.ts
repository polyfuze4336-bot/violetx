import { aiModelLabel, aiProviderLabel } from "@/ai/client";
import { generateProgramWithAi } from "@/ai/program";
import { exerciseEntryRepository, exerciseRepository } from "@/lib/repositories/exercise";
import { programRepository, type ProgramWithTemplates } from "@/lib/repositories/program";
import { requireOwnerAthlete, requireViewerAthlete } from "@/lib/services/context";
import { derivePersonalRecords } from "@/lib/services/personalRecord";
import { exerciseKeys } from "@/lib/exercise-library";
import { AuthorizationError, NotFoundError } from "@/lib/rbac";
import {
  parseDaysFromRequest,
  pickTodayTemplate,
  estimateMinutes,
  proposeProgramFromRequest,
} from "@/lib/programs";
import {
  programSchema,
  type ParsedProgram,
  type ProgramInput,
  type ProgramProposal,
} from "@/lib/program-schemas";
import { inferMuscleGroup, rollingWindow, type TrainingSet } from "@/lib/training-analytics";

export interface ProgramExerciseDTO {
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec: number | null;
  notes: string | null;
}

export interface ProgramTemplateDTO {
  id: string;
  name: string;
  weekday: number | null;
  notes: string | null;
  exercises: ProgramExerciseDTO[];
  estimatedMinutes: number;
}

export interface ProgramDTO {
  id: string;
  name: string;
  programType: string;
  description: string | null;
  isActive: boolean;
  archived: boolean;
  source: string;
  templates: ProgramTemplateDTO[];
}

export interface TodayWorkoutDTO {
  program: { id: string; name: string };
  template: ProgramTemplateDTO;
  lastCompletedAt: string | null;
}

export interface ProgramProposalDTO {
  source: "ai" | "rules";
  summary: string;
  program: ParsedProgram;
}

function toDTO(p: ProgramWithTemplates): ProgramDTO {
  return {
    id: p.id,
    name: p.name,
    programType: p.programType,
    description: p.description,
    isActive: p.isActive,
    archived: p.archived,
    source: p.source,
    templates: p.templates.map((t) => {
      const exercises = t.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exercise.name,
        targetSets: e.targetSets,
        repMin: e.repMin,
        repMax: e.repMax,
        restSec: e.restSec,
        notes: e.notes,
      }));
      return {
        id: t.id,
        name: t.name,
        weekday: t.weekday,
        notes: t.notes,
        exercises,
        estimatedMinutes: estimateMinutes(exercises),
      };
    }),
  };
}

/** Map program exercise names to library exercises, creating custom ones for unknown names. */
async function resolveExerciseIds(athleteId: string, program: ParsedProgram): Promise<Map<string, string>> {
  const library = await exerciseRepository.list(athleteId);
  const byKey = new Map<string, string>();
  for (const e of library) for (const k of exerciseKeys(e.name, e.aliases)) byKey.set(k, e.id);

  const resolved = new Map<string, string>();
  for (const t of program.templates) {
    for (const ex of t.exercises) {
      const key = ex.exerciseName.trim().toLowerCase();
      if (resolved.has(key)) continue;
      let id = (ex.exerciseId && library.find((l) => l.id === ex.exerciseId)?.id) || byKey.get(key);
      if (!id) {
        const group = inferMuscleGroup(ex.exerciseName);
        const created = await exerciseRepository.create({
          athleteId,
          name: ex.exerciseName.trim(),
          muscleGroup: group === "Other" ? null : group,
          isCustom: true,
          active: true,
        });
        id = created.id;
        byKey.set(key, id);
      }
      resolved.set(key, id);
    }
  }
  return resolved;
}

async function writeTemplates(
  athleteId: string,
  programId: string,
  program: ParsedProgram,
  ids: Map<string, string>
) {
  const keepIds: string[] = [];
  let order = 0;
  for (const t of program.templates) {
    const exercises = t.exercises.map((e, i) => ({
      exerciseId: ids.get(e.exerciseName.trim().toLowerCase())!,
      sortOrder: i,
      targetSets: e.targetSets,
      repMin: e.repMin,
      repMax: e.repMax,
      restSec: e.restSec ?? null,
      notes: e.notes || null,
    }));
    const data = { name: t.name, dayOrder: order++, weekday: t.weekday ?? null, notes: t.notes || null };
    let templateId = t.id;
    const existing = templateId ? await programRepository.getTemplate(athleteId, templateId) : null;
    if (existing && existing.program.id === programId) {
      await programRepository.updateTemplate(athleteId, existing.id, { ...data, archived: false });
    } else {
      templateId = (await programRepository.createTemplate({ ...data, programId, athleteId })).id;
    }
    await programRepository.replaceTemplateExercises(templateId!, exercises);
    keepIds.push(templateId!);
  }
  return keepIds;
}

export const programService = {
  async list(includeArchived = false): Promise<ProgramDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    return (await programRepository.list(athleteId, includeArchived)).map(toDTO);
  },

  async get(id: string): Promise<ProgramDTO> {
    const { athleteId } = await requireViewerAthlete();
    const p = await programRepository.getById(athleteId, id);
    if (!p) throw new NotFoundError("Program not found.");
    return toDTO(p);
  },

  async create(
    input: ProgramInput,
    meta: { source?: "MANUAL" | "AI"; provider?: string | null; model?: string | null } = {}
  ): Promise<ProgramDTO> {
    const { athleteId, actor } = await requireOwnerAthlete();
    const data = programSchema.parse(input);
    const ids = await resolveExerciseIds(athleteId, data);
    const hasActive = (await programRepository.list(athleteId)).some((p) => p.isActive);
    const program = await programRepository.createProgram({
      athleteId,
      name: data.name,
      programType: data.programType,
      description: data.description || null,
      source: meta.source ?? "MANUAL",
      isActive: !hasActive,
    });
    await writeTemplates(athleteId, program.id, data, ids);
    if (meta.provider) {
      await programRepository.logProposal({
        athleteId,
        kind: "PROGRAM",
        status: "APPROVED",
        provider: meta.provider ?? null,
        model: meta.model ?? null,
        payload: JSON.stringify(data),
        createdById: actor.userId,
      });
    }
    return programService.get(program.id);
  },

  /** Edit in place. Removed days are archived when past workouts reference them. */
  async update(input: ProgramInput): Promise<ProgramDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = programSchema.parse(input);
    if (!data.id) throw new NotFoundError("Program not found.");
    const existing = await programRepository.getById(athleteId, data.id);
    if (!existing) throw new NotFoundError("Program not found.");

    const ids = await resolveExerciseIds(athleteId, data);
    await programRepository.updateProgram(athleteId, data.id, {
      name: data.name,
      programType: data.programType,
      description: data.description || null,
    });
    const keep = await writeTemplates(athleteId, data.id, data, ids);
    for (const t of existing.templates) {
      if (keep.includes(t.id)) continue;
      if ((await programRepository.templateSessionCount(t.id)) > 0) {
        await programRepository.updateTemplate(athleteId, t.id, { archived: true });
      } else {
        await programRepository.deleteTemplate(athleteId, t.id);
      }
    }
    return programService.get(data.id);
  },

  async duplicate(id: string): Promise<ProgramDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const p = await programRepository.getById(athleteId, id);
    if (!p) throw new NotFoundError("Program not found.");
    const dto = toDTO(p);
    return programService.create({
      name: `${dto.name} (copy)`.slice(0, 120),
      programType: dto.programType as ParsedProgram["programType"],
      description: dto.description ?? undefined,
      templates: dto.templates.map((t) => ({
        name: t.name,
        weekday: t.weekday,
        notes: t.notes ?? undefined,
        exercises: t.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          targetSets: e.targetSets,
          repMin: e.repMin,
          repMax: e.repMax,
          restSec: e.restSec,
          notes: e.notes ?? undefined,
        })),
      })),
    });
  },

  async setArchived(id: string, archived: boolean): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await programRepository.updateProgram(athleteId, id, {
      archived,
      ...(archived ? { isActive: false } : {}),
    });
    if (count === 0) throw new NotFoundError("Program not found.");
  },

  async setActive(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const p = await programRepository.getById(athleteId, id);
    if (!p || p.archived) throw new NotFoundError("Program not found.");
    await programRepository.setActiveExclusive(athleteId, id);
  },

  /** The workout to do today from the active program (null when none). */
  async today(now: Date = new Date()): Promise<TodayWorkoutDTO | null> {
    const { athleteId } = await requireViewerAthlete();
    const programs = await programRepository.list(athleteId);
    const active = programs.find((p) => p.isActive) ?? null;
    if (!active) return null;
    const last = await programRepository.lastCompletedTemplate(athleteId, active.id);
    const dto = toDTO(active);
    const pick = pickTodayTemplate(
      dto.templates.map((t, i) => ({ ...t, dayOrder: i })),
      last?.templateId ?? null,
      now.getDay()
    );
    return pick
      ? {
          program: { id: dto.id, name: dto.name },
          template: dto.templates.find((t) => t.id === pick.id)!,
          lastCompletedAt: last?.date.toISOString() ?? null,
        }
      : null;
  },

  /**
   * Generate a PROPOSAL only. Nothing is saved: the athlete reviews/edits the
   * result and confirms through create(), which re-validates it.
   */
  async propose(request: string, days?: number): Promise<ProgramProposalDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const text = request.trim().slice(0, 600);
    if (text.length < 3) throw new AuthorizationError("Describe what you want from the program.");
    const requestedDays = days ?? parseDaysFromRequest(text) ?? null;

    const [library, entries] = await Promise.all([
      exerciseRepository.list(athleteId),
      exerciseEntryRepository.list(athleteId),
    ]);
    const records = derivePersonalRecords(entries);
    const rows: TrainingSet[] = entries
      .filter((e) => e.setType !== "WARMUP")
      .map((e) => ({
        date: e.date.toISOString(),
        exerciseId: e.exerciseId,
        exerciseName: e.exercise?.name ?? "",
        muscleGroup: e.exercise?.muscleGroup ?? null,
        reps: e.reps,
        weightKg: Number(e.weightKg),
        sets: e.sets ?? null,
      }));

    const ai = await generateProgramWithAi({
      request: text,
      daysPerWeek: requestedDays,
      library: library.filter((e) => e.active).map((e) => e.name).slice(0, 80),
      strength: records
        .sort((a, b) => b.estimatedOneRepMaxKg - a.estimatedOneRepMaxKg)
        .slice(0, 8)
        .map((r) => ({ exercise: r.exerciseName.slice(0, 60), estimatedOneRepMaxKg: r.estimatedOneRepMaxKg, sessions: r.totalSets })),
      sessionsPerWeek: rollingWindow(rows).sessionsPerWeek,
      equipment: Array.from(new Set(library.map((e) => e.equipment).filter((x): x is string => Boolean(x)))),
    });
    const proposal: ProgramProposal | null = ai;
    if (proposal) return { source: "ai", summary: proposal.summary, program: proposal.program };

    const fallback = proposeProgramFromRequest(text, requestedDays ?? undefined);
    return { source: "rules", summary: fallback.summary, program: fallback.program };
  },

  /** Confirm a reviewed proposal: re-validated server-side, then saved with an audit entry. */
  async confirmProposal(input: ProgramInput, source: "ai" | "rules"): Promise<ProgramDTO> {
    return programService.create(input, {
      source: source === "ai" ? "AI" : "MANUAL",
      provider: source === "ai" ? aiProviderLabel() : "violet-rules",
      model: aiModelLabel(),
    });
  },
};
