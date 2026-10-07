// Pure readiness scoring. Fitness/recovery guidance only — not medical advice.

export interface CheckInInput {
  sleepHours: number;
  sleepQuality: number; // 1 poor .. 5 great
  energy: number; // 1 low .. 5 high
  soreness: number; // 1 fresh .. 5 very sore
  stress: number; // 1 calm .. 5 very stressed
  motivation: number; // 1 low .. 5 high
}

export type ReadinessLabel = "Excellent" | "Good" | "Moderate" | "Low";

export interface Readiness {
  score: number;
  label: ReadinessLabel;
  components: { sleep: number; energy: number; soreness: number; stress: number; motivation: number };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fromScale = (v: number) => clamp(((v - 1) / 4) * 100); // 1..5 → 0..100
const inverted = (v: number) => clamp(((5 - v) / 4) * 100); // 1 best .. 5 worst

/** 7–9 h is ideal; shorter sleep falls off linearly, a little oversleeping barely. */
export function sleepDurationScore(hours: number): number {
  if (hours >= 7 && hours <= 9) return 100;
  if (hours < 7) return clamp(((hours - 3) / 4) * 100);
  return clamp(100 - (hours - 9) * 7.5);
}

export function computeReadiness(c: CheckInInput): Readiness {
  const sleep = Math.round(sleepDurationScore(c.sleepHours) * 0.6 + fromScale(c.sleepQuality) * 0.4);
  const components = {
    sleep,
    energy: Math.round(fromScale(c.energy)),
    soreness: Math.round(inverted(c.soreness)),
    stress: Math.round(inverted(c.stress)),
    motivation: Math.round(fromScale(c.motivation)),
  };
  const score = Math.round(
    components.sleep * 0.3 +
      components.energy * 0.2 +
      components.soreness * 0.2 +
      components.stress * 0.15 +
      components.motivation * 0.15
  );
  const label: ReadinessLabel = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 50 ? "Moderate" : "Low";
  return { score, label, components };
}

export interface RecentSessionContext {
  /** e.g. "Monday" */
  dayName: string;
  region: "upper-body" | "lower-body" | "full-body";
  daysAgo: number;
}

const NAMES: Record<keyof Readiness["components"], string> = {
  sleep: "sleep",
  energy: "energy",
  soreness: "muscle soreness",
  stress: "stress",
  motivation: "motivation",
};

/** Plain-language, non-diagnostic explanation of a readiness score. */
export function explainReadiness(
  r: Readiness,
  checkIn: Pick<CheckInInput, "soreness" | "sleepHours">,
  recent: RecentSessionContext | null
): string {
  const entries = Object.entries(r.components) as [keyof Readiness["components"], number][];
  const lowest = entries.sort((a, b) => a[1] - b[1])[0];
  const parts: string[] = [`Your readiness is ${r.label.toLowerCase()} (${r.score}/100).`];

  if (checkIn.soreness >= 4 && recent && recent.daysAgo <= 3) {
    const region = recent.region === "full-body" ? "" : `${recent.region.replace("-body", "")} `;
    parts.push(`${region ? region.charAt(0).toUpperCase() + region.slice(1) : "Muscle "}soreness is elevated following ${recent.dayName}'s ${recent.region} session, which is common — consider lighter loads or a different muscle group today.`);
  } else if (lowest[1] < 60) {
    parts.push(`${NAMES[lowest[0]].charAt(0).toUpperCase() + NAMES[lowest[0]].slice(1)} is the weakest area today.`);
  } else {
    parts.push("Nothing stands out as a limiter today.");
  }
  if (checkIn.sleepHours < 6) parts.push("Short sleep can reduce performance, so keep effort comfortable and prioritise rest tonight.");
  parts.push("This is fitness and recovery guidance, not medical advice.");
  return parts.join(" ");
}

/** Classify a session's main region from its muscle-group set counts. */
export function sessionRegion(setsByMuscle: Record<string, number>): "upper-body" | "lower-body" | "full-body" {
  const upper = ["Chest", "Back", "Shoulders", "Biceps", "Triceps"].reduce((a, m) => a + (setsByMuscle[m] ?? 0), 0);
  const lower = ["Quads", "Hamstrings", "Glutes & Hips", "Calves"].reduce((a, m) => a + (setsByMuscle[m] ?? 0), 0);
  const total = upper + lower;
  if (total === 0) return "full-body";
  if (upper / total >= 0.7) return "upper-body";
  if (lower / total >= 0.7) return "lower-body";
  return "full-body";
}
