// Pure builders for the read-only coach view. No IO. Everything returned here
// is already stripped of internal ids, notes and account details so it is safe
// to hand to a page that anyone holding the link can open.

import { prEventDetail, type PrEvent } from "@/lib/analytics";
import { epley } from "@/lib/training-analytics";
import {
  progressionText,
  type Progression,
} from "@/lib/violet-insights";

export type PublicPrKind = "WEIGHT" | "ASSISTANCE" | "REPS" | "E1RM";

export interface PublicAchievement {
  exerciseName: string;
  date: string;
  kind: PublicPrKind;
  /** "Weight PR", "Rep PR", "Estimated 1RM PR", "Assistance PR". */
  label: string;
  /** "+2 reps at 80 kg", "5 kg less assistance (30 → 25 kg)". */
  detail: string;
  weightKg: number;
  reps: number;
  assisted: boolean;
}

export interface PublicProgression {
  lift: string;
  kind: "LOAD" | "ASSISTANCE" | "REPS";
  /** One-line, e.g. "Bench Press: 8 → 10 reps at 80 kg". */
  text: string;
  assisted: boolean;
}

export interface E1rmPr {
  exerciseName: string;
  date: string;
  valueKg: number;
  previousKg: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Days on which an exercise's best estimated 1RM beat every earlier day.
 * The first day is a baseline. Assisted lifts are skipped (the weight is
 * assistance, so an Epley estimate is meaningless).
 */
export function detectE1rmPrs(
  sets: { exerciseName: string; date: string; weightKg: number; reps: number; assisted?: boolean }[]
): E1rmPr[] {
  const byExercise = new Map<string, Map<string, number>>();
  for (const s of sets) {
    if (s.assisted || s.reps <= 0) continue;
    const days = byExercise.get(s.exerciseName) ?? new Map<string, number>();
    const day = s.date.slice(0, 10);
    days.set(day, Math.max(days.get(day) ?? 0, round1(epley(s.weightKg, s.reps))));
    byExercise.set(s.exerciseName, days);
  }
  const out: E1rmPr[] = [];
  for (const [exerciseName, days] of Array.from(byExercise.entries())) {
    let best = 0;
    for (const day of Array.from(days.keys()).sort()) {
      const v = days.get(day)!;
      if (best > 0 && v > best) out.push({ exerciseName, date: day, valueKg: v, previousKg: best });
      best = Math.max(best, v);
    }
  }
  return out;
}

const KIND_LABEL: Record<PublicPrKind, string> = {
  WEIGHT: "Weight PR",
  ASSISTANCE: "Assistance PR",
  REPS: "Rep PR",
  E1RM: "Estimated 1RM PR",
};

/** All PR types merged, newest first, with internal ids removed. */
export function buildAchievements(prEvents: PrEvent[], e1rm: E1rmPr[]): PublicAchievement[] {
  const fromEvents = prEvents.map<PublicAchievement>((e) => {
    const d = prEventDetail(e);
    return {
      exerciseName: e.exerciseName,
      date: e.date,
      kind: e.type,
      label: d.label,
      detail: d.detail,
      weightKg: e.weightKg,
      reps: e.reps,
      assisted: e.assisted === true,
    };
  });
  const fromE1rm = e1rm.map<PublicAchievement>((p) => ({
    exerciseName: p.exerciseName,
    date: p.date,
    kind: "E1RM",
    label: KIND_LABEL.E1RM,
    detail: `${p.valueKg} kg estimated (+${round1(p.valueKg - p.previousKg)} kg)`,
    weightKg: p.valueKg,
    reps: 1,
    assisted: false,
  }));
  return [...fromEvents, ...fromE1rm].sort((a, b) => b.date.localeCompare(a.date));
}

export function countByKind(list: PublicAchievement[]): Record<PublicPrKind, number> {
  const out: Record<PublicPrKind, number> = { WEIGHT: 0, ASSISTANCE: 0, REPS: 0, E1RM: 0 };
  for (const a of list) out[a.kind] += 1;
  return out;
}

export function toPublicProgressions(list: Progression[]): PublicProgression[] {
  return list.map((p) => ({
    lift: p.lift,
    kind: p.kind,
    text: progressionText(p),
    assisted: p.assisted === true,
  }));
}

/** Reword Violet's second-person summary for a coach reading about Patient X. */
export function forCoach(text: string, patientLabel: string): string {
  return text
    .replace(/\bYou're\b/g, `${patientLabel} is`)
    .replace(/\bYou are\b/g, `${patientLabel} is`)
    .replace(/\byour\b/gi, "their")
    .replace(/\byou\b/gi, "they");
}
