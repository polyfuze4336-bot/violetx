// Pure analytics engine for the Analytics page. No IO. Everything is derived
// from recorded data; sparse data yields empty/short series rather than
// invented precision.

import {
  epley,
  isoDay,
  periodLabel,
  periodStart,
  addPeriods,
  resolveMuscleGroup,
  rowAssisted,
  rowVolumeKg,
  type TrainingSet,
} from "@/lib/training-analytics";

export const RANGES = ["7D", "30D", "3M", "6M", "1Y", "ALL"] as const;
export type RangeKey = (typeof RANGES)[number];

const RANGE_DAYS: Record<Exclude<RangeKey, "ALL">, number> = { "7D": 7, "30D": 30, "3M": 90, "6M": 180, "1Y": 365 };
const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AnalyticsSet extends TrainingSet {
  sessionId?: string | null;
  setType?: string | null;
}

export interface AnalyticsSession {
  id: string;
  date: string;
  durationMin: number | null;
  sessionRpe: number | null;
}

export interface AnalyticsPr {
  date: string;
  exerciseName: string;
  type: "WEIGHT" | "ASSISTANCE" | "REPS";
  weightKg: number;
  reps: number;
  prevWeightKg?: number | null;
  prevReps?: number | null;
  assisted?: boolean;
}

export interface AnalyticsInput {
  sets: AnalyticsSet[];
  sessions: AnalyticsSession[];
  weights: { date: string; value: number }[];
  measurements: { name: string; unit: string; date: string; value: number }[];
  prs: AnalyticsPr[];
  /** Sessions per week planned by the active program (null = no program). */
  plannedPerWeek: number | null;
}

export interface Bucket {
  key: string;
  label: string;
  workouts: number;
  sets: number;
  volumeKg: number;
  prs: number;
}

export interface AnalyticsResult {
  range: RangeKey;
  from: string;
  to: string;
  bucket: "day" | "week" | "month";
  totals: {
    workouts: number;
    sets: number;
    volumeKg: number;
    workoutsPerWeek: number;
    avgDurationMin: number | null;
    avgSessionRpe: number | null;
  };
  buckets: Bucket[];
  consistency: { weeksMet: number; weeks: number; pct: number | null; weeklyTarget: number };
  volumeByMuscle: { muscle: string; sets: number; volumeKg: number }[];
  volumeByExercise: { name: string; sets: number; volumeKg: number }[];
  weekdayDistribution: { label: string; workouts: number }[];
  exerciseFrequency: { name: string; sessions: number }[];
  prTimeline: AnalyticsPr[];
  e1rmTrends: { name: string; points: { date: string; e1rm: number }[]; changePct: number | null }[];
  weightVsStrength: { label: string; weightIndex: number | null; strengthIndex: number | null }[];
  measurementTrends: { name: string; unit: string; first: number; latest: number; delta: number; points: number[] }[];
  durations: { date: string; minutes: number; rpe: number | null }[];
  /** Plain-language observations about training distribution (not medical). */
  observations: string[];
  adherence: { pct: number | null; planned: number; done: number; weekly: { label: string; done: number; planned: number }[] } | null;
}

function rangeBounds(range: RangeKey, now: Date, earliest: string | null): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  if (range === "ALL") return { from: earliest ?? to, to };
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - (RANGE_DAYS[range] - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

function bucketKind(days: number): "day" | "week" | "month" {
  return days <= 31 ? "day" : days <= 200 ? "week" : "month";
}

function bucketStart(day: string, kind: "day" | "week" | "month"): string {
  return kind === "day" ? day : periodStart(day, kind);
}

function nextBucket(key: string, kind: "day" | "week" | "month"): string {
  return kind === "day"
    ? new Date(new Date(`${key}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10)
    : addPeriods(key, kind, 1);
}

function bucketLabel(key: string, kind: "day" | "week" | "month"): string {
  if (kind === "month") return periodLabel(key, "month");
  return periodLabel(key, "week"); // "17 Aug" works for day and week starts
}

const UPPER = ["Chest", "Back", "Shoulders", "Biceps", "Triceps"];
const LOWER = ["Quads", "Hamstrings", "Glutes & Hips", "Calves"];

/** Observations about how volume is distributed. Phrased as observations only. */
export function muscleObservations(byMuscle: { muscle: string; sets: number }[]): string[] {
  const sets = (names: string[]) => byMuscle.filter((m) => names.includes(m.muscle)).reduce((a, m) => a + m.sets, 0);
  const upper = sets(UPPER);
  const lower = sets(LOWER);
  const out: string[] = [];
  if (upper + lower >= 20) {
    if (lower > 0 && lower < upper * 0.75) {
      out.push(`Recent training volume is upper-body biased: lower-body volume is about ${Math.round((1 - lower / upper) * 100)}% lower than upper-body.`);
    } else if (upper > 0 && upper < lower * 0.75) {
      out.push(`Recent training volume is lower-body biased: upper-body volume is about ${Math.round((1 - upper / lower) * 100)}% lower than lower-body.`);
    } else if (lower === 0) {
      out.push("No lower-body training was recorded in this period.");
    }
    const push = sets(["Chest", "Shoulders", "Triceps"]);
    const pull = sets(["Back", "Biceps"]);
    if (push > 0 && pull > 0 && push / pull > 1.5) out.push("Pushing volume is noticeably higher than pulling volume.");
    if (pull > 0 && push > 0 && pull / push > 1.5) out.push("Pulling volume is noticeably higher than pushing volume.");
  }
  const major = ["Chest", "Back", "Shoulders", "Quads", "Hamstrings", "Glutes & Hips"];
  const missing = major.filter((g) => !byMuscle.some((m) => m.muscle === g && m.sets > 0));
  if (byMuscle.length >= 3 && missing.length > 0 && missing.length <= 3) out.push(`No recorded sets for: ${missing.join(", ")}.`);
  return out;
}

export function buildAnalytics(input: AnalyticsInput, range: RangeKey, now: Date = new Date()): AnalyticsResult {
  const work = input.sets.filter((s) => s.setType !== "WARMUP");
  const earliest = [...work.map((s) => isoDay(s.date)), ...input.weights.map((w) => isoDay(w.date))].sort()[0] ?? null;
  const { from, to } = rangeBounds(range, now, earliest);
  const inRange = (d: string) => isoDay(d) >= from && isoDay(d) <= to;

  const sets = work.filter((s) => inRange(s.date));
  const spanDays = Math.max(1, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS) + 1);
  const kind = bucketKind(spanDays);
  const weeks = Math.max(1, spanDays / 7);

  const sessionById = new Map(input.sessions.map((s) => [s.id, s]));
  const days = new Set(sets.map((s) => isoDay(s.date)));
  const rowSets = (s: AnalyticsSet) => (s.sets && s.sets > 0 ? s.sets : 1);

  // Buckets (zero-filled so charts show gaps honestly).
  const buckets = new Map<string, Bucket & { days: Set<string> }>();
  for (let k = bucketStart(from, kind); k <= to; k = nextBucket(k, kind)) {
    buckets.set(k, { key: k, label: bucketLabel(k, kind), workouts: 0, sets: 0, volumeKg: 0, prs: 0, days: new Set() });
  }
  for (const s of sets) {
    const b = buckets.get(bucketStart(isoDay(s.date), kind));
    if (!b) continue;
    b.days.add(isoDay(s.date));
    b.sets += rowSets(s);
    b.volumeKg += rowVolumeKg(s, rowSets(s));
  }
  const prs = input.prs.filter((p) => inRange(p.date));
  for (const p of prs) {
    const b = buckets.get(bucketStart(isoDay(p.date), kind));
    if (b) b.prs += 1;
  }
  const bucketList: Bucket[] = Array.from(buckets.values()).map(({ days: d, ...b }) => ({
    ...b,
    workouts: d.size,
    volumeKg: Math.round(b.volumeKg),
  }));

  // Weekly consistency against the target (program days/week, default 3).
  const weeklyTarget = input.plannedPerWeek && input.plannedPerWeek > 0 ? input.plannedPerWeek : 3;
  const weekMap = new Map<string, Set<string>>();
  for (let k = periodStart(from, "week"); k <= to; k = addPeriods(k, "week", 1)) weekMap.set(k, new Set());
  for (const d of Array.from(days)) weekMap.get(periodStart(d, "week"))?.add(d);
  const wkCounts = Array.from(weekMap.values()).map((s) => s.size);
  // Ignore the still-running current week when judging consistency.
  const completeCounts = wkCounts.length > 1 ? wkCounts.slice(0, -1) : wkCounts;
  const weeksMet = completeCounts.filter((c) => c >= weeklyTarget).length;
  const consistency = {
    weeksMet,
    weeks: completeCounts.length,
    pct: completeCounts.length >= 2 ? Math.round((weeksMet / completeCounts.length) * 100) : null,
    weeklyTarget,
  };

  // Volume by muscle / exercise.
  const muscle = new Map<string, { sets: number; volumeKg: number }>();
  const exercise = new Map<string, { sets: number; volumeKg: number; days: Set<string> }>();
  for (const s of sets) {
    const m = resolveMuscleGroup(s.exerciseName, s.muscleGroup);
    const vm = muscle.get(m) ?? { sets: 0, volumeKg: 0 };
    vm.sets += rowSets(s);
    vm.volumeKg += rowVolumeKg(s, rowSets(s));
    muscle.set(m, vm);
    const ve = exercise.get(s.exerciseName) ?? { sets: 0, volumeKg: 0, days: new Set<string>() };
    ve.sets += rowSets(s);
    ve.volumeKg += rowVolumeKg(s, rowSets(s));
    ve.days.add(isoDay(s.date));
    exercise.set(s.exerciseName, ve);
  }

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of Array.from(days)) weekdayCounts[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7] += 1;

  // Estimated 1RM trends for the most-trained exercises.
  // Assisted lifts are excluded: an estimated 1RM of an assistance weight is meaningless.
  const assistedNames = new Set(sets.filter(rowAssisted).map((s) => s.exerciseName));
  const top = Array.from(exercise.entries())
    .filter(([name]) => !assistedNames.has(name))
    .sort((a, b) => b[1].sets - a[1].sets)
    .slice(0, 5);
  const e1rmTrends = top.map(([name]) => {
    const perDay = new Map<string, number>();
    for (const s of sets.filter((x) => x.exerciseName === name)) {
      const d = isoDay(s.date);
      perDay.set(d, Math.max(perDay.get(d) ?? 0, round1(epley(s.weightKg, s.reps))));
    }
    const points = Array.from(perDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, e1rm]) => ({ date, e1rm }));
    const first = points[0]?.e1rm;
    const last = points[points.length - 1]?.e1rm;
    return { name, points, changePct: points.length > 1 && first ? round1(((last - first) / first) * 100) : null };
  });

  // Body weight vs strength, both indexed to 100 at the first reading in range.
  const wsBuckets = new Map<string, { w: number[]; s: number[] }>();
  for (const w of input.weights.filter((x) => inRange(x.date))) {
    const k = bucketStart(isoDay(w.date), kind === "day" ? "week" : kind);
    const e = wsBuckets.get(k) ?? { w: [], s: [] };
    e.w.push(w.value);
    wsBuckets.set(k, e);
  }
  const topNames = new Set(top.map(([n]) => n));
  const e1rmByEx = new Map<string, Map<string, number>>();
  for (const s of sets.filter((x) => topNames.has(x.exerciseName))) {
    const k = bucketStart(isoDay(s.date), kind === "day" ? "week" : kind);
    const per = e1rmByEx.get(s.exerciseName) ?? new Map<string, number>();
    per.set(k, Math.max(per.get(k) ?? 0, epley(s.weightKg, s.reps)));
    e1rmByEx.set(s.exerciseName, per);
  }
  const keys = Array.from(new Set([...Array.from(wsBuckets.keys()), ...Array.from(e1rmByEx.values()).flatMap((m) => Array.from(m.keys()))])).sort();
  const firstW = (() => {
    const e = wsBuckets.get(keys.find((k) => wsBuckets.has(k)) ?? "");
    return e ? e.w.reduce((a, b) => a + b, 0) / e.w.length : null;
  })();
  const baseline = new Map<string, number>();
  for (const [name, per] of Array.from(e1rmByEx.entries())) {
    const firstKey = Array.from(per.keys()).sort()[0];
    baseline.set(name, per.get(firstKey)!);
  }
  const weightVsStrength = keys.map((k) => {
    const w = wsBuckets.get(k);
    const idx: number[] = [];
    for (const [name, per] of Array.from(e1rmByEx.entries())) {
      const v = per.get(k);
      if (v) idx.push((v / baseline.get(name)!) * 100);
    }
    return {
      label: bucketLabel(k, kind === "day" ? "week" : kind),
      weightIndex: w && firstW ? round1(((w.w.reduce((a, b) => a + b, 0) / w.w.length) / firstW) * 100) : null,
      strengthIndex: idx.length ? round1(idx.reduce((a, b) => a + b, 0) / idx.length) : null,
    };
  });

  // Measurement trends.
  const byName = new Map<string, { unit: string; pts: { date: string; value: number }[] }>();
  for (const m of input.measurements.filter((x) => inRange(x.date))) {
    const e = byName.get(m.name) ?? { unit: m.unit, pts: [] };
    e.pts.push({ date: m.date, value: m.value });
    byName.set(m.name, e);
  }
  const measurementTrends = Array.from(byName.entries())
    .map(([name, e]) => {
      const pts = e.pts.sort((a, b) => a.date.localeCompare(b.date));
      return { name, unit: e.unit, first: pts[0].value, latest: pts[pts.length - 1].value, delta: round1(pts[pts.length - 1].value - pts[0].value), points: pts.map((p) => p.value) };
    })
    .filter((m) => m.points.length >= 1);

  // Durations / session RPE (only sessions that recorded them).
  const sessionsInRange = input.sessions.filter((s) => inRange(s.date));
  const durations = sessionsInRange
    .filter((s) => s.durationMin !== null)
    .map((s) => ({ date: isoDay(s.date), minutes: s.durationMin!, rpe: s.sessionRpe }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const rpes = sessionsInRange.map((s) => s.sessionRpe).filter((r): r is number => r !== null);

  // Program adherence: planned sessions per week vs distinct training days.
  let adherence: AnalyticsResult["adherence"] = null;
  if (input.plannedPerWeek && input.plannedPerWeek > 0) {
    const weekly = Array.from(weekMap.entries()).map(([k, d]) => ({ label: periodLabel(k, "week"), done: d.size, planned: input.plannedPerWeek! }));
    const complete = weekly.length > 1 ? weekly.slice(0, -1) : weekly;
    const planned = complete.reduce((a, w) => a + w.planned, 0);
    const done = complete.reduce((a, w) => a + Math.min(w.done, w.planned), 0);
    adherence = { pct: planned > 0 && complete.length >= 1 ? Math.round((done / planned) * 100) : null, planned, done, weekly };
  }

  const totalVolume = sets.reduce((a, s) => a + rowVolumeKg(s, rowSets(s)), 0);
  const durs = durations.map((d) => d.minutes);
  void sessionById;

  return {
    range,
    from,
    to,
    bucket: kind,
    totals: {
      workouts: days.size,
      sets: sets.reduce((a, s) => a + rowSets(s), 0),
      volumeKg: Math.round(totalVolume),
      workoutsPerWeek: round1(days.size / weeks),
      avgDurationMin: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      avgSessionRpe: rpes.length ? round1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null,
    },
    buckets: bucketList,
    consistency,
    volumeByMuscle: Array.from(muscle.entries()).map(([m, v]) => ({ muscle: m, sets: v.sets, volumeKg: Math.round(v.volumeKg) })).sort((a, b) => b.sets - a.sets),
    volumeByExercise: Array.from(exercise.entries()).map(([name, v]) => ({ name, sets: v.sets, volumeKg: Math.round(v.volumeKg) })).sort((a, b) => b.volumeKg - a.volumeKg).slice(0, 10),
    observations: muscleObservations(Array.from(muscle.entries()).map(([m, v]) => ({ muscle: m, sets: v.sets }))),
    weekdayDistribution: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, workouts: weekdayCounts[i] })),
    exerciseFrequency: Array.from(exercise.entries()).map(([name, v]) => ({ name, sessions: v.days.size })).sort((a, b) => b.sessions - a.sessions).slice(0, 10),
    prTimeline: prs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((p) => ({ ...p, date: isoDay(p.date) })),
    e1rmTrends,
    weightVsStrength,
    measurementTrends,
    durations,
    adherence,
  };
}
