// Pure Gym Journey analytics. Totals always come from the branch dataset — never
// hardcode counts. Only ACTIVE branches count toward current exploration %.
// Visits to now-inactive branches remain in history but do not count toward the
// current percentage (documented historical-statistics policy).

export interface GymBranchLite {
  id: string;
  name: string;
  state: string;
  active: boolean;
}

export interface GymVisitLite {
  gymBranchId: string;
  visitedAt: string; // ISO
}

export interface StateProgress {
  state: string;
  total: number;
  visited: number;
}

export interface JourneyStats {
  totalActive: number;
  uniqueVisited: number; // distinct ACTIVE branches visited
  remaining: number;
  percent: number; // 0..100, one decimal
  statesVisited: number;
  totalStates: number;
  byState: StateProgress[];
  latestBranchId: string | null;
  firstBranchId: string | null;
  mostVisitedBranchId: string | null;
  distinctVisitDays: number;
}

export function computeJourneyStats(
  branches: GymBranchLite[],
  visits: GymVisitLite[]
): JourneyStats {
  const active = branches.filter((b) => b.active);
  const activeIds = new Set(active.map((b) => b.id));
  const totalActive = active.length;

  // Distinct active branches visited (repeat visits do not increase this).
  const visitedActiveIds = new Set(
    visits.map((v) => v.gymBranchId).filter((id) => activeIds.has(id))
  );
  const uniqueVisited = visitedActiveIds.size;

  // State progress (active branches only).
  const stateMap = new Map<string, StateProgress>();
  for (const b of active) {
    const sp =
      stateMap.get(b.state) ?? { state: b.state, total: 0, visited: 0 };
    sp.total += 1;
    if (visitedActiveIds.has(b.id)) sp.visited += 1;
    stateMap.set(b.state, sp);
  }
  const byState = Array.from(stateMap.values()).sort((a, b) =>
    a.state.localeCompare(b.state)
  );

  // Latest / first / most-visited (by visit records, across all branches).
  const sorted = [...visits].sort((a, b) =>
    a.visitedAt.localeCompare(b.visitedAt)
  );
  const firstBranchId = sorted[0]?.gymBranchId ?? null;
  const latestBranchId = sorted[sorted.length - 1]?.gymBranchId ?? null;

  const counts = new Map<string, number>();
  for (const v of visits) {
    counts.set(v.gymBranchId, (counts.get(v.gymBranchId) ?? 0) + 1);
  }
  let mostVisitedBranchId: string | null = null;
  let mostCount = 0;
  for (const [id, c] of Array.from(counts.entries())) {
    if (c > mostCount) {
      mostCount = c;
      mostVisitedBranchId = id;
    }
  }

  const distinctVisitDays = new Set(
    visits.map((v) => v.visitedAt.slice(0, 10))
  ).size;

  return {
    totalActive,
    uniqueVisited,
    remaining: Math.max(0, totalActive - uniqueVisited),
    percent: totalActive === 0 ? 0 : Math.round((uniqueVisited / totalActive) * 1000) / 10,
    statesVisited: byState.filter((s) => s.visited > 0).length,
    totalStates: byState.length,
    byState,
    latestBranchId,
    firstBranchId,
    mostVisitedBranchId,
    distinctVisitDays,
  };
}

export interface Achievement {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

/**
 * Achievements adapt to the live branch dataset so they never become impossible
 * as branches open or close.
 */
export function computeAchievements(stats: JourneyStats): Achievement[] {
  const stateComplete = stats.byState.some(
    (s) => s.total > 0 && s.visited === s.total
  );
  return [
    {
      key: "first-step",
      label: "First Step",
      description: "Visit your first gym.",
      unlocked: stats.uniqueVisited >= 1,
    },
    {
      key: "explorer",
      label: "Explorer",
      description: "Visit 10 gyms.",
      unlocked: stats.uniqueVisited >= 10,
    },
    {
      key: "violet-traveller",
      label: "Violet Traveller",
      description: "Visit 25 gyms.",
      unlocked: stats.uniqueVisited >= 25,
    },
    {
      key: "state-explorer",
      label: "State Explorer",
      description: "Visit every tracked gym in one state/territory.",
      unlocked: stateComplete,
    },
    {
      key: "malaysia-50",
      label: "Malaysia 50",
      description: "Visit 50 branches.",
      unlocked: stats.uniqueVisited >= 50,
    },
    {
      key: "century-club",
      label: "Century Club",
      description: "Visit 100 branches.",
      unlocked: stats.uniqueVisited >= 100,
    },
  ];
}
