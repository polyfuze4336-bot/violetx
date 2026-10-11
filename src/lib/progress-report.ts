// Builds the data behind the coach PDF. Pure: every number comes from the
// recorded sets and the PR engine's events, never from estimates or defaults.
// Internal ids, emails and notes are deliberately not part of the report.

import { prEventDetail, type PrEvent } from "@/lib/analytics";

export interface ReportSet {
  date: string; // ISO
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  assisted: boolean;
  /** Where the set came from (MANUAL, WHATSAPP, ...). */
  source: string;
}

export interface ReportPr {
  date: string; // yyyy-mm-dd
  label: string;
  result: string;
  change: string;
}

export interface ReportExercise {
  name: string;
  assisted: boolean;
  daysRecorded: number;
  firstDate: string;
  lastDate: string;
  /** Heaviest set, or the lowest assistance for assisted lifts. */
  best: { weightKg: number; reps: number; date: string };
  mostReps: { reps: number; weightKg: number; date: string };
  /** Calculated (Epley) from recorded sets; null for assisted lifts. */
  estimatedOneRepMaxKg: number | null;
  prs: ReportPr[];
  /** Top set per training day, oldest first (last 10). */
  trend: { date: string; weightKg: number; reps: number }[];
  /** "70 kg -> 80 kg" style summary of the load change, null with one session. */
  loadChange: string | null;
}

export interface ProgressReport {
  athleteLabel: string;
  generatedOn: string; // yyyy-mm-dd
  scope: string;
  totals: { exercises: number; daysRecorded: number; sets: number; prs: number; fromWhatsApp: number };
  exercises: ReportExercise[];
  notes: string[];
}

const day = (iso: string) => iso.slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => `${Math.round(n * 100) / 100}`;
const epley = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

function prRow(e: PrEvent): ReportPr {
  const d = prEventDetail(e);
  return {
    date: day(e.date),
    label: d.label,
    result: `${fmt(e.weightKg)} kg${e.assisted ? " assistance" : ""} x ${e.reps}`,
    change: d.detail,
  };
}

export function buildProgressReport(input: {
  sets: ReportSet[];
  prEvents: PrEvent[];
  /** Restrict the report to one exercise (by id). */
  exerciseId?: string;
  now?: Date;
  athleteLabel: string;
}): ProgressReport {
  const now = input.now ?? new Date();
  const sets = input.exerciseId ? input.sets.filter((s) => s.exerciseId === input.exerciseId) : input.sets;
  const events = input.exerciseId ? input.prEvents.filter((e) => e.exerciseId === input.exerciseId) : input.prEvents;

  const byExercise = new Map<string, ReportSet[]>();
  for (const s of sets) (byExercise.get(s.exerciseId) ?? byExercise.set(s.exerciseId, []).get(s.exerciseId)!).push(s);

  const exercises: ReportExercise[] = [];
  for (const [id, list] of Array.from(byExercise.entries())) {
    const assisted = list.some((s) => s.assisted);
    const days = new Map<string, ReportSet>();
    for (const s of list) {
      const d = day(s.date);
      const cur = days.get(d);
      const better = assisted
        ? !cur || s.weightKg < cur.weightKg || (s.weightKg === cur.weightKg && s.reps > cur.reps)
        : !cur || s.weightKg > cur.weightKg || (s.weightKg === cur.weightKg && s.reps > cur.reps);
      if (better) days.set(d, s);
    }
    const ordered = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const tops = ordered.map(([d, s]) => ({ date: d, weightKg: s.weightKg, reps: s.reps }));

    const best = tops.reduce((a, b) => {
      const better = assisted ? b.weightKg < a.weightKg : b.weightKg > a.weightKg;
      return better || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a;
    });
    const mostRepsSet = list.reduce((a, b) => (b.reps > a.reps || (b.reps === a.reps && (assisted ? b.weightKg < a.weightKg : b.weightKg > a.weightKg)) ? b : a));
    const first = tops[0];
    const latest = tops[tops.length - 1];
    const e1rm = assisted ? null : round1(Math.max(...list.map((s) => epley(s.weightKg, s.reps))));

    exercises.push({
      name: list[0].exerciseName,
      assisted,
      daysRecorded: tops.length,
      firstDate: first.date,
      lastDate: latest.date,
      best,
      mostReps: { reps: mostRepsSet.reps, weightKg: mostRepsSet.weightKg, date: day(mostRepsSet.date) },
      estimatedOneRepMaxKg: e1rm,
      prs: events
        .filter((e) => e.exerciseId === id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(prRow),
      trend: tops.slice(-10),
      loadChange:
        tops.length > 1 && first.weightKg !== latest.weightKg
          ? `${fmt(first.weightKg)} kg -> ${fmt(latest.weightKg)} kg${assisted ? " assistance" : ""}`
          : null,
    });
  }
  // Most PRs first, then the most recently trained.
  exercises.sort((a, b) => b.prs.length - a.prs.length || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));

  const allDays = new Set(sets.map((s) => day(s.date)));
  const notes = [
    "Generated from the sets recorded in VioletX (entered in the app or imported from WhatsApp). Nothing is estimated except where labelled.",
    "Estimated 1RM is calculated with the Epley formula from recorded sets. It is not a tested one-rep max.",
    "Assisted lifts: lower assistance means stronger. PRs are measured by the PR engine against earlier recorded sets only.",
  ];
  return {
    athleteLabel: input.athleteLabel,
    generatedOn: now.toISOString().slice(0, 10),
    scope: input.exerciseId && exercises[0] ? exercises[0].name : "All exercises",
    totals: {
      exercises: exercises.length,
      daysRecorded: allDays.size,
      sets: sets.length,
      prs: events.length,
      fromWhatsApp: sets.filter((s) => s.source === "WHATSAPP").length,
    },
    exercises,
    notes,
  };
}
