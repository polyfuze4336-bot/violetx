// Gym Journey ↔ workouts. Pure helpers: workouts per gym, favourite gym and
// workout-driven achievements (kept subtle; no gamified pressure).

import type { Achievement } from "@/lib/gym-analytics";

export interface WorkoutAtGym {
  date: string;
  gymBranchId: string | null;
}

export interface BranchLite {
  id: string;
  name: string;
  state: string;
}

export interface GymWorkoutCount {
  id: string;
  name: string;
  state: string;
  workouts: number;
  lastWorkout: string;
}

/** Workouts recorded at each gym (distinct days), most-used first. */
export function workoutsByGym(workouts: WorkoutAtGym[], branches: BranchLite[]): GymWorkoutCount[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const days = new Map<string, Set<string>>();
  const last = new Map<string, string>();
  for (const w of workouts) {
    if (!w.gymBranchId || !byId.has(w.gymBranchId)) continue;
    const d = w.date.slice(0, 10);
    (days.get(w.gymBranchId) ?? days.set(w.gymBranchId, new Set()).get(w.gymBranchId)!).add(d);
    if (!last.has(w.gymBranchId) || d > last.get(w.gymBranchId)!) last.set(w.gymBranchId, d);
  }
  return Array.from(days.entries())
    .map(([id, set]) => ({ id, name: byId.get(id)!.name, state: byId.get(id)!.state, workouts: set.size, lastWorkout: last.get(id)! }))
    .sort((a, b) => b.workouts - a.workouts || b.lastWorkout.localeCompare(a.lastWorkout));
}

export function favouriteGym(counts: GymWorkoutCount[]): GymWorkoutCount | null {
  return counts[0] ?? null;
}

/** Gyms whose first-ever visit falls on/after `since`. */
export function newGymsSince(visits: { gymBranchId: string; visitedAt: string }[], since: string): number {
  const first = new Map<string, string>();
  for (const v of visits) {
    const d = v.visitedAt.slice(0, 10);
    if (!first.has(v.gymBranchId) || d < first.get(v.gymBranchId)!) first.set(v.gymBranchId, d);
  }
  return Array.from(first.values()).filter((d) => d >= since.slice(0, 10)).length;
}

export interface WorkoutAchievementInput {
  totalWorkouts: number;
  totalPrs: number;
  gymsVisited: number;
  statesVisited: number;
  /** Consecutive weeks meeting the weekly session target. */
  consistentWeeks: number;
}

export function computeWorkoutAchievements(i: WorkoutAchievementInput): Achievement[] {
  return [
    { key: "first-workout", label: "First Workout", description: "Log your first workout.", unlocked: i.totalWorkouts >= 1 },
    { key: "workouts-10", label: "10 Workouts", description: "Complete 10 workouts.", unlocked: i.totalWorkouts >= 10 },
    { key: "workouts-50", label: "50 Workouts", description: "Complete 50 workouts.", unlocked: i.totalWorkouts >= 50 },
    { key: "workouts-100", label: "100 Workouts", description: "Complete 100 workouts.", unlocked: i.totalWorkouts >= 100 },
    { key: "first-pr", label: "First PR", description: "Set your first personal record.", unlocked: i.totalPrs >= 1 },
    { key: "prs-10", label: "10 PRs", description: "Set 10 personal records.", unlocked: i.totalPrs >= 10 },
    { key: "gyms-5", label: "5 Gyms Visited", description: "Train at 5 different gyms.", unlocked: i.gymsVisited >= 5 },
    { key: "gyms-10", label: "10 Gyms Visited", description: "Train at 10 different gyms.", unlocked: i.gymsVisited >= 10 },
    { key: "new-state", label: "New State", description: "Visit a gym in a second state or territory.", unlocked: i.statesVisited >= 2 },
    { key: "consistency-4", label: "4-Week Consistency", description: "Hit your weekly session target 4 weeks in a row.", unlocked: i.consistentWeeks >= 4 },
  ];
}
