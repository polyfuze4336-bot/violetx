import { exerciseRepository } from "@/lib/repositories/exercise";
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

  /** Everything the user may pick from when choosing another exercise. */
  async choices(): Promise<ExerciseChoiceDTO[]> {
    const { athleteId } = await requireOwnerAthlete();
    const sources = await loadSources(athleteId);
    return sources
      .map((s) => ({ ref: s.ref, name: s.name, source: s.source }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};
