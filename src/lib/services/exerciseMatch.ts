import { exerciseEntryRepository, exerciseRepository } from "@/lib/repositories/exercise";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/rbac";
import { exerciseIdentityKeys, parseExerciseRef } from "@/lib/exercise-matching";
import { reviewExerciseNames, type NameFixProposal } from "@/lib/exercise-name-review";
import { starterCreateData } from "@/lib/exercise-library";
import { requireOwnerAthlete } from "@/lib/services/context";
import { STARTER_EXERCISES } from "@/lib/exercise-library";
import { suggestExerciseWithAi } from "@/ai/exercise-match";
import { getAzureOpenAiConfig } from "@/ai/client";
import {
  aiShortlist,
  applyAiCandidates,
  buildMatchSources,
  isUncertain,
  matchExercise,
  normalizeExerciseName,
  type ExerciseMatch,
  type MatchSource,
  type MatchStatus,
} from "@/lib/exercise-matching";

export interface ExerciseSuggestionDTO {
  input: string;
  status: MatchStatus;
  candidates: { ref: string; name: string; score: number; source: "library" | "starter"; origin: "deterministic" | "ai" }[];
  usedAi: boolean;
}

export interface ExerciseChoiceDTO {
  ref: string;
  name: string;
  source: "library" | "starter";
}

const MAX_NAMES = 60;
const MAX_AI_CALLS = 8;

function toDto(m: ExerciseMatch): ExerciseSuggestionDTO {
  return {
    input: m.input,
    status: m.status,
    usedAi: m.usedAi === true,
    candidates: m.candidates.map((c) => ({ ref: c.ref, name: c.name, score: c.score, source: c.source, origin: c.origin })),
  };
}

async function loadSources(athleteId: string): Promise<MatchSource[]> {
  const library = await exerciseRepository.list(athleteId);
  return buildMatchSources(library, STARTER_EXERCISES);
}

export const exerciseMatchService = {
  /**
   * Propose the exercise each name probably refers to. Deterministic matching
   * first; the AI is consulted only for uncertain names and can only choose
   * from a shortlist the application built (validated by applyAiCandidates).
   * Nothing is written: the user confirms every correction.
   */
  async suggest(names: string[]): Promise<ExerciseSuggestionDTO[]> {
    const { athleteId } = await requireOwnerAthlete();
    const sources = await loadSources(athleteId);
    const distinct = new Map<string, string>();
    for (const n of names.slice(0, MAX_NAMES * 2)) {
      const trimmed = n.trim().slice(0, 120);
      const key = normalizeExerciseName(trimmed);
      if (key && !distinct.has(key)) distinct.set(key, trimmed);
      if (distinct.size >= MAX_NAMES) break;
    }

    const base = Array.from(distinct.values()).map((n) => matchExercise(n, sources));
    const aiEnabled = getAzureOpenAiConfig() !== null;
    let budget = MAX_AI_CALLS;
    const final = await Promise.all(
      base.map(async (m) => {
        if (!aiEnabled || !isUncertain(m) || budget <= 0) return m;
        budget -= 1;
        const shortlist = aiShortlist(m.input, sources);
        const ai = await suggestExerciseWithAi(m.input, shortlist);
        return ai ? applyAiCandidates(m, shortlist, ai) : m;
      })
    );
    return final.map(toDto);
  },

  /**
   * Spelling mistakes and duplicates among exercises that are already saved
   * (imported before name checking, or typed by hand). Read-only: proposals only.
   */
  async reviewLibrary(): Promise<NameFixProposal[]> {
    const { athleteId } = await requireOwnerAthlete();
    const [library, entries] = await Promise.all([exerciseRepository.list(athleteId), exerciseEntryRepository.list(athleteId)]);
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
    return reviewExerciseNames(
      library.map((l) => ({ id: l.id, name: l.name, aliases: l.aliases, active: l.active })),
      STARTER_EXERCISES,
      counts
    );
  },

  /**
   * Apply ONE confirmed correction. RENAME keeps the exercise and its history
   * and remembers the old spelling as an alias. MERGE moves the recorded sets,
   * workout rows, template rows and goals to the target exercise, then removes
   * the emptied duplicate. The target is validated against the athlete's own
   * library or the canonical list; it can never be an arbitrary id.
   */
  async applyNameFix(input: { exerciseId: string; action: "RENAME" | "MERGE"; targetRef: string }): Promise<{ name: string }> {
    const { athleteId } = await requireOwnerAthlete();
    const ref = parseExerciseRef(input.targetRef);
    const library = await exerciseRepository.list(athleteId);
    const source = library.find((l) => l.id === input.exerciseId);
    if (!source || !ref) throw new NotFoundError("That exercise suggestion is not valid. Review the names again.");

    const MAX_ALIASES = 400;
    const addAlias = (aliases: string | null, name: string, owner: { name: string }) => {
      if (exerciseIdentityKeys(name)[0] === exerciseIdentityKeys(owner.name)[0]) return aliases;
      const next = [aliases, name].filter(Boolean).join(", ");
      return next.length <= MAX_ALIASES ? next : aliases;
    };

    if (input.action === "RENAME") {
      if (ref.kind !== "starter") throw new NotFoundError("That exercise suggestion is not valid. Review the names again.");
      const starter = STARTER_EXERCISES.find((s) => s.name === ref.name);
      if (!starter) throw new NotFoundError("That exercise suggestion is not valid. Review the names again.");
      const keys = new Set(exerciseIdentityKeys(starter.name, starter.aliases));
      const clash = library.find((l) => l.id !== source.id && exerciseIdentityKeys(l.name, l.aliases).some((k) => keys.has(k)));
      if (clash) throw new NotFoundError("An exercise with that name already exists. Merge into it instead.");
      const meta = starterCreateData(starter);
      await exerciseRepository.update(athleteId, source.id, {
        name: starter.name,
        aliases: addAlias(source.aliases, source.name, starter),
        category: source.category ?? meta.category ?? null,
        muscleGroup: source.muscleGroup ?? meta.muscleGroup ?? null,
        equipment: source.equipment ?? meta.equipment ?? null,
      });
      return { name: starter.name };
    }

    if (ref.kind !== "id" || ref.id === source.id) throw new NotFoundError("That exercise suggestion is not valid. Review the names again.");
    const target = library.find((l) => l.id === ref.id);
    if (!target) throw new NotFoundError("That exercise suggestion is not valid. Review the names again.");

    await prisma.$transaction([
      prisma.exerciseEntry.updateMany({ where: { athleteId, exerciseId: source.id }, data: { exerciseId: target.id } }),
      prisma.workoutExercise.updateMany({ where: { athleteId, exerciseId: source.id }, data: { exerciseId: target.id } }),
      prisma.workoutTemplateExercise.updateMany({ where: { exerciseId: source.id }, data: { exerciseId: target.id } }),
      prisma.goal.updateMany({ where: { athleteId, exerciseId: source.id }, data: { exerciseId: target.id } }),
      prisma.exercise.update({
        where: { id: target.id },
        data: { aliases: addAlias(addAlias(target.aliases, source.name, target), source.aliases ?? "", target) || null },
      }),
      prisma.exercise.deleteMany({ where: { id: source.id, athleteId } }),
    ]);
    return { name: target.name };
  },

  /** Everything the user may pick from when choosing another exercise. */
  async choices(): Promise<ExerciseChoiceDTO[]> {
    const { athleteId } = await requireOwnerAthlete();
    const sources = await loadSources(athleteId);
    return sources
      .map((s) => ({ ref: s.ref, name: s.name, source: s.source }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};
