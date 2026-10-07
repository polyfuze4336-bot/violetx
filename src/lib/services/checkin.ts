import { checkInRepository } from "@/lib/repositories/goal";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { requireOwnerAthlete, requireViewerAthlete } from "@/lib/services/context";
import { toNumber } from "@/lib/dto";
import {
  computeReadiness,
  explainReadiness,
  sessionRegion,
  type CheckInInput,
  type Readiness,
  type RecentSessionContext,
} from "@/lib/readiness";
import { checkInSchema, type CheckInFormInput } from "@/lib/goal-schemas";
import { resolveMuscleGroup } from "@/lib/training-analytics";

export interface CheckInDTO {
  date: string;
  sleepHours: number;
  sleepQuality: number;
  energy: number;
  soreness: number;
  stress: number;
  motivation: number;
  /** Private to the athlete (hidden from coaches). */
  restingHr: number | null;
  notes: string | null;
  readiness: Readiness;
}

export interface RecoveryOverviewDTO {
  today: (CheckInDTO & { explanation: string }) | null;
  history: CheckInDTO[];
  average7d: number | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDTO(row: Awaited<ReturnType<typeof checkInRepository.getByDate>> & object, isOwner: boolean): CheckInDTO {
  const input: CheckInInput = {
    sleepHours: toNumber(row.sleepHours),
    sleepQuality: row.sleepQuality,
    energy: row.energy,
    soreness: row.soreness,
    stress: row.stress,
    motivation: row.motivation,
  };
  return {
    date: row.date.toISOString(),
    ...input,
    restingHr: isOwner ? row.restingHr : null,
    notes: isOwner ? row.notes : null,
    readiness: computeReadiness(input),
  };
}

/** Readiness scores only (no notes or heart rate) — safe for the coach view. */
export async function readinessHistory(athleteId: string, days = 30, now: Date = new Date()): Promise<{ date: string; score: number }[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await checkInRepository.list(athleteId, since);
  return rows.map((r) => ({
    date: r.date.toISOString(),
    score: computeReadiness({
      sleepHours: toNumber(r.sleepHours),
      sleepQuality: r.sleepQuality,
      energy: r.energy,
      soreness: r.soreness,
      stress: r.stress,
      motivation: r.motivation,
    }).score,
  }));
}

export const checkInService = {
  async upsert(input: CheckInFormInput): Promise<CheckInDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = checkInSchema.parse(input);
    const row = await checkInRepository.upsert(athleteId, data.date, {
      sleepHours: data.sleepHours,
      sleepQuality: data.sleepQuality,
      energy: data.energy,
      soreness: data.soreness,
      stress: data.stress,
      motivation: data.motivation,
      restingHr: data.restingHr ?? null,
      notes: data.notes ?? null,
    });
    return toDTO(row, true);
  },

  /** Recent check-ins, with an explanation for the check-in dated `todayIso`. */
  async overview(todayIso: string, days = 30): Promise<RecoveryOverviewDTO> {
    const { athleteId, actor } = await requireViewerAthlete();
    const isOwner = actor.role === "OWNER";
    const today = new Date(`${todayIso}T00:00:00.000Z`);
    const since = new Date(today.getTime() - days * 86_400_000);
    const rows = await checkInRepository.list(athleteId, since);
    const history = rows.map((r) => toDTO(r, isOwner));

    const current = history.find((h) => h.date.slice(0, 10) === todayIso) ?? null;
    let explained: RecoveryOverviewDTO["today"] = null;
    if (current) {
      const entries = await exerciseEntryRepository.list(athleteId);
      let recent: RecentSessionContext | null = null;
      const cutoff = today.getTime() - 3 * 86_400_000;
      const recentEntries = entries.filter(
        (e) => e.setType !== "WARMUP" && e.date.getTime() >= cutoff && e.date.getTime() < today.getTime() + 86_400_000
      );
      if (recentEntries.length > 0) {
        const lastDay = recentEntries.map((e) => e.date.toISOString().slice(0, 10)).sort().pop()!;
        const bySet: Record<string, number> = {};
        for (const e of recentEntries.filter((x) => x.date.toISOString().slice(0, 10) === lastDay)) {
          const g = resolveMuscleGroup(e.exercise?.name ?? "", e.exercise?.muscleGroup ?? null);
          bySet[g] = (bySet[g] ?? 0) + 1;
        }
        const d = new Date(`${lastDay}T00:00:00Z`);
        recent = {
          dayName: DAY_NAMES[d.getUTCDay()],
          region: sessionRegion(bySet),
          daysAgo: Math.round((today.getTime() - d.getTime()) / 86_400_000),
        };
      }
      explained = { ...current, explanation: explainReadiness(current.readiness, current, recent) };
    }

    const last7 = history.filter((h) => new Date(h.date).getTime() >= today.getTime() - 6 * 86_400_000);
    const average7d = last7.length > 0 ? Math.round(last7.reduce((a, h) => a + h.readiness.score, 0) / last7.length) : null;
    return { today: explained, history, average7d };
  },
};
