// Finds spelling mistakes and duplicates among exercises that are ALREADY saved
// (for example imported before name checking existed), so they can be corrected
// after upload. Pure: it only proposes. The user confirms every change.

import {
  buildMatchSources,
  matchExercise,
  parseExerciseRef,
  type MatchSource,
} from "@/lib/exercise-matching";

export type NameFixAction = "RENAME" | "MERGE";

export interface NameFixProposal {
  exerciseId: string;
  name: string;
  action: NameFixAction;
  /** Canonical name it would become / the exercise it would merge into. */
  targetName: string;
  /** "starter:<name>" (RENAME) or "id:<exerciseId>" (MERGE). Validated again on apply. */
  targetRef: string;
  confidence: number;
  /** Recorded sets that would stay with the exercise (RENAME) or move (MERGE). */
  entryCount: number;
  reason: "MISSPELLED" | "DUPLICATE";
}

export interface LibraryRow {
  id: string;
  name: string;
  aliases: string | null;
  active: boolean;
}

/**
 * Propose renames and merges for the athlete's saved exercises.
 *  - a close misspelling of a canonical exercise they do not have yet  -> RENAME
 *  - a misspelling of, or the same name as, another saved exercise     -> MERGE
 * A name that already equals a canonical exercise is never touched.
 */
export function reviewExerciseNames(
  library: LibraryRow[],
  starters: { name: string; aliases?: string[] }[],
  entryCounts: Map<string, number>
): NameFixProposal[] {
  const active = library.filter((l) => l.active);
  const count = (id: string) => entryCounts.get(id) ?? 0;
  const proposals: NameFixProposal[] = [];

  for (const ex of active) {
    const others = active.filter((o) => o.id !== ex.id);
    const sources: MatchSource[] = buildMatchSources(others, starters);
    const m = matchExercise(ex.name, sources);
    if (m.status !== "EXACT" && m.status !== "HIGH") continue;
    const top = m.candidates[0];
    if (!top) continue;
    const parsed = parseExerciseRef(top.ref);
    if (!parsed) continue;

    if (parsed.kind === "starter") {
      // Already spelled exactly like the canonical exercise: nothing to fix.
      if (m.status === "EXACT") continue;
      proposals.push({
        exerciseId: ex.id,
        name: ex.name,
        action: "RENAME",
        targetName: top.name,
        targetRef: top.ref,
        confidence: top.score,
        entryCount: count(ex.id),
        reason: "MISSPELLED",
      });
      continue;
    }

    // Another saved exercise. When two are alike, merge the one with fewer sets.
    const other = others.find((o) => o.id === parsed.id);
    if (!other) continue;
    const exSets = count(ex.id);
    const otherSets = count(other.id);
    if (exSets > otherSets || (exSets === otherSets && ex.id < other.id)) continue;
    proposals.push({
      exerciseId: ex.id,
      name: ex.name,
      action: "MERGE",
      targetName: other.name,
      targetRef: top.ref,
      confidence: top.score,
      entryCount: exSets,
      reason: m.status === "EXACT" ? "DUPLICATE" : "MISSPELLED",
    });
  }
  return proposals.sort((a, b) => b.entryCount - a.entryCount || a.name.localeCompare(b.name));
}
