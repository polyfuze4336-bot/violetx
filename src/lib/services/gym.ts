import { gymBranchRepository, gymVisitRepository } from "@/lib/repositories/gym";
import { NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import {
  computeAchievements,
  computeJourneyStats,
  type Achievement,
  type JourneyStats,
} from "@/lib/gym-analytics";
import {
  computeWorkoutAchievements,
  favouriteGym,
  newGymsSince,
  workoutsByGym,
  type GymWorkoutCount,
} from "@/lib/gym-workouts";
import { computeGoalProgress } from "@/lib/goals";
import { exerciseEntryRepository } from "@/lib/repositories/exercise";
import { workoutRepository } from "@/lib/repositories/workout";
import { derivePrEvents } from "@/lib/services/personalRecord";

export interface GymBranchDTO {
  id: string;
  name: string;
  city: string | null;
  state: string;
  latitude: number;
  longitude: number;
  active: boolean;
  visited: boolean;
  visitedAt: string | null;
  visitCount: number;
}

export interface JourneyDTO {
  stats: JourneyStats;
  achievements: Achievement[];
  latestBranchName: string | null;
  firstBranchName: string | null;
  mostVisitedBranchName: string | null;
  /** Workout-driven additions (workouts logged against a gym). */
  workouts: {
    totalWorkouts: number;
    byGym: GymWorkoutCount[];
    favouriteGymName: string | null;
    newGymsLast30Days: number;
  };
}

export interface GymOptionDTO {
  id: string;
  name: string;
  city: string | null;
  state: string;
}

async function loadBranchesAndVisits(athleteId: string) {
  const [branches, visits] = await Promise.all([
    gymBranchRepository.list(),
    gymVisitRepository.list(athleteId),
  ]);
  return { branches, visits };
}

export const gymService = {
  /** Branches with the athlete's visit state (readable by coach). */
  async listBranches(): Promise<GymBranchDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const { branches, visits } = await loadBranchesAndVisits(athleteId);

    const byBranch = new Map<string, { count: number; latest: Date }>();
    for (const v of visits) {
      const cur = byBranch.get(v.gymBranchId);
      if (!cur) byBranch.set(v.gymBranchId, { count: 1, latest: v.visitedAt });
      else {
        cur.count += 1;
        if (v.visitedAt > cur.latest) cur.latest = v.visitedAt;
      }
    }

    return branches.map((b) => {
      const info = byBranch.get(b.id);
      return {
        id: b.id,
        name: b.name,
        city: b.city,
        state: b.state,
        latitude: b.latitude,
        longitude: b.longitude,
        active: b.active,
        visited: Boolean(info),
        visitedAt: info?.latest.toISOString() ?? null,
        visitCount: info?.count ?? 0,
      };
    });
  },

  /** Journey statistics + achievements (readable by coach). */
  async getJourney(): Promise<JourneyDTO> {
    const { athleteId } = await requireViewerAthlete();
    const { branches, visits } = await loadBranchesAndVisits(athleteId);

    const stats = computeJourneyStats(
      branches.map((b) => ({
        id: b.id,
        name: b.name,
        state: b.state,
        active: b.active,
      })),
      visits.map((v) => ({
        gymBranchId: v.gymBranchId,
        visitedAt: v.visitedAt.toISOString(),
      }))
    );

    const nameById = new Map(branches.map((b) => [b.id, b.name]));

    // Workout-driven view: gyms where workouts were logged, plus milestones.
    const [gymSessions, entries] = await Promise.all([
      workoutRepository.gymSessions(athleteId),
      exerciseEntryRepository.list(athleteId),
    ]);
    const working = entries.filter((e) => e.setType !== "WARMUP");
    const trainingDays = Array.from(new Set(working.map((e) => e.date.toISOString().slice(0, 10))));
    const byGym = workoutsByGym(
      gymSessions.map((s) => ({ date: s.date.toISOString(), gymBranchId: s.gymBranchId })),
      branches.map((b) => ({ id: b.id, name: b.name, state: b.state }))
    );
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const streak = computeGoalProgress(
      { type: "CONSISTENCY", startValue: 0, targetValue: 4, weeklyTarget: 3, startDate: since },
      { trainingDays }
    ).current ?? 0;
    const workoutAchievements = computeWorkoutAchievements({
      totalWorkouts: trainingDays.length,
      totalPrs: derivePrEvents(entries).length,
      gymsVisited: stats.uniqueVisited,
      statesVisited: stats.statesVisited,
      consistentWeeks: streak,
    });
    const seen = new Set(computeAchievements(stats).map((a) => a.key));

    return {
      stats,
      achievements: [...computeAchievements(stats), ...workoutAchievements.filter((a) => !seen.has(a.key))],
      workouts: {
        totalWorkouts: trainingDays.length,
        byGym: byGym.slice(0, 8),
        favouriteGymName: favouriteGym(byGym)?.name ?? null,
        newGymsLast30Days: newGymsSince(
          visits.map((v) => ({ gymBranchId: v.gymBranchId, visitedAt: v.visitedAt.toISOString() })),
          since
        ),
      },
      latestBranchName: stats.latestBranchId
        ? nameById.get(stats.latestBranchId) ?? null
        : null,
      firstBranchName: stats.firstBranchId
        ? nameById.get(stats.firstBranchId) ?? null
        : null,
      mostVisitedBranchName: stats.mostVisitedBranchId
        ? nameById.get(stats.mostVisitedBranchId) ?? null
        : null,
    };
  },

  /** Owner-only: gyms matching a search, for the workout gym picker. */
  async searchBranches(query: string): Promise<GymOptionDTO[]> {
    await requireOwnerAthlete();
    const q = query.trim().slice(0, 60);
    if (q.length < 2) return [];
    const rows = await gymBranchRepository.search(q);
    return rows.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, city: b.city, state: b.state }));
  },

  /** Owner-only: gyms trained at most recently (up to 4). */
  async recentBranches(): Promise<GymOptionDTO[]> {
    const { athleteId } = await requireOwnerAthlete();
    const visits = await gymVisitRepository.list(athleteId);
    const ids = Array.from(new Set(visits.slice().reverse().map((v) => v.gymBranchId))).slice(0, 4);
    const out: GymOptionDTO[] = [];
    for (const id of ids) {
      const b = await gymBranchRepository.getById(id);
      if (b && b.active) out.push({ id: b.id, name: b.name, city: b.city, state: b.state });
    }
    return out;
  },

  /** Owner-only: mark a branch visited (defaults to today). */
  async markVisited(gymBranchId: string, visitedAt?: Date): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const branch = await gymBranchRepository.getById(gymBranchId);
    if (!branch) throw new NotFoundError("Gym branch not found.");
    await gymVisitRepository.create({
      athleteId,
      gymBranchId,
      visitedAt: visitedAt ?? new Date(),
      source: "MANUAL",
    });
  },

  /** Owner-only: remove all visits to a branch (undo). */
  async removeVisit(gymBranchId: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    await gymVisitRepository.deleteForBranch(athleteId, gymBranchId);
  },
};
