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
    return {
      stats,
      achievements: computeAchievements(stats),
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
