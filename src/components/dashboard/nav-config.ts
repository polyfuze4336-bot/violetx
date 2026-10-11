import {
  BarChart3,
  CalendarCheck,
  GitCompareArrows,
  HeartPulse,
  History,
  Home,
  KeyRound,
  LineChart,
  Map,
  MessageSquareText,
  MessageSquareWarning,
  MoreHorizontal,
  Play,
  Ruler,
  Salad,
  Settings,
  Share2,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/rbac";

/**
 * Information architecture: gym progress first.
 *
 * Exactly five primary destinations (desktop sidebar and mobile bottom bar):
 *   Home · Workout · Progress · Violet · More
 * Everything else stays reachable, grouped under More, and the pages inside
 * Workout and Progress are tabs (see WORKOUT_TABS / PROGRESS_TABS). No page was
 * removed: every existing route still works.
 */

export type PrimaryKey = "home" | "workout" | "progress" | "violet" | "more";

export interface PrimaryNavItem {
  key: PrimaryKey;
  href: string;
  label: string;
  icon: LucideIcon;
}

const OWNER = "OWNER";
const DEMO = "DEMO_VIEWER";

/** The primary destinations for a role (five for the athlete and the demo viewer). */
export function primaryNavFor(role: Role): PrimaryNavItem[] {
  const owner = role === OWNER;
  const demo = role === DEMO;
  const items: PrimaryNavItem[] = [
    { key: "home", href: "/dashboard", label: "Home", icon: Home },
    // Starting a workout is owner-only; everyone else opens the workout history.
    { key: "workout", href: owner ? "/dashboard/workout" : "/dashboard/workouts", label: "Workout", icon: Play },
    { key: "progress", href: "/dashboard/progress", label: "Progress", icon: BarChart3 },
  ];
  // Violet answers questions for the athlete (and the read-only demo), not coaches.
  if (owner || demo) items.push({ key: "violet", href: "/dashboard/coach", label: "Violet", icon: Sparkles });
  items.push({ key: "more", href: "/dashboard/more", label: "More", icon: MoreHorizontal });
  return items;
}

// Which primary destination a route belongs to (first match wins).
const SECTION_ROUTES: [string, PrimaryKey][] = [
  ["/dashboard/workouts", "workout"],
  ["/dashboard/workout", "workout"],
  ["/dashboard/programs", "workout"],
  ["/dashboard/exercises", "workout"],
  ["/dashboard/import", "workout"],
  ["/dashboard/progress", "progress"],
  ["/dashboard/records", "progress"],
  ["/dashboard/strength", "progress"],
  ["/dashboard/weight", "progress"],
  ["/dashboard/measurements", "progress"],
  ["/dashboard/coach", "violet"],
];

const underPath = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Primary destination to highlight for a path. Secondary pages highlight More. */
export function sectionOf(pathname: string): PrimaryKey {
  if (pathname === "/dashboard") return "home";
  for (const [prefix, key] of SECTION_ROUTES) if (underPath(pathname, prefix)) return key;
  return "more";
}

// --- Tabs inside Workout and Progress -------------------------------------------

export interface SectionTab {
  href: string;
  label: string;
  /** Other paths that keep this tab highlighted. */
  also?: string[];
  /** Owner-only (e.g. starting a workout). */
  ownerOnly?: boolean;
  /** Second-level switcher shown while this tab is active. */
  sub?: { href: string; label: string }[];
}

export const WORKOUT_TABS: SectionTab[] = [
  { href: "/dashboard/workout", label: "Today", ownerOnly: true },
  { href: "/dashboard/workouts", label: "History" },
  { href: "/dashboard/programs", label: "Programs" },
  { href: "/dashboard/exercises", label: "Exercises" },
];

export const PROGRESS_TABS: SectionTab[] = [
  { href: "/dashboard/progress", label: "Overview" },
  { href: "/dashboard/records", label: "PRs" },
  { href: "/dashboard/strength", label: "Exercises" },
  {
    href: "/dashboard/weight",
    label: "Body",
    also: ["/dashboard/measurements"],
    sub: [
      { href: "/dashboard/weight", label: "Weight" },
      { href: "/dashboard/measurements", label: "Measurements" },
    ],
  },
];

export function tabsFor(tabs: SectionTab[], role: Role | null | undefined): SectionTab[] {
  return tabs.filter((t) => !t.ownerOnly || role === OWNER);
}

export function isTabActive(tab: SectionTab, pathname: string): boolean {
  return [tab.href, ...(tab.also ?? [])].some((p) => underPath(pathname, p));
}

// --- More ---------------------------------------------------------------------

export interface MoreLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  /** Owner-only, but the read-only view works for the demo viewer. */
  demoVisible?: boolean;
}

export interface MoreGroup {
  title: string;
  items: MoreLink[];
}

export const MORE_GROUPS: MoreGroup[] = [
  {
    title: "Training insights",
    items: [
      { href: "/dashboard/review", label: "Weekly review", description: "This week's training and PRs", icon: CalendarCheck },
      { href: "/dashboard/analytics", label: "Analytics", description: "Volume, frequency and trends", icon: LineChart },
      { href: "/dashboard/compare", label: "Compare", description: "Compare periods side by side", icon: GitCompareArrows },
      { href: "/dashboard/history", label: "Day-by-day log", description: "Everything you have logged", icon: History },
    ],
  },
  {
    title: "Health & tracking",
    items: [
      { href: "/dashboard/nutrition", label: "Nutrition", description: "Calories, protein and water", icon: Salad, ownerOnly: true, demoVisible: true },
      { href: "/dashboard/recovery", label: "Recovery", description: "Daily readiness check-in", icon: HeartPulse },
      { href: "/dashboard/measurements", label: "Measurements", description: "Waist, chest and more", icon: Ruler },
      { href: "/dashboard/goals", label: "Goals", description: "Targets and progress", icon: Target },
    ],
  },
  {
    title: "Journey",
    items: [
      { href: "/dashboard/gym", label: "Gym Journey", description: "Gyms you have explored", icon: Map },
      { href: "/dashboard/records", label: "Achievements", description: "Personal records and milestones", icon: Trophy },
    ],
  },
  {
    title: "Sharing",
    items: [
      { href: "/dashboard/settings#coach-share", label: "Coach share", description: "A read-only link for your coach", icon: Share2, ownerOnly: true },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings", label: "Settings & profile", description: "Profile, units and preferences", icon: Settings, ownerOnly: true },
      { href: "/dashboard/password", label: "Change password", description: "Update your sign-in password", icon: KeyRound, ownerOnly: true },
      { href: "/dashboard/feedback", label: "Report a bug / request a feature", description: "Tell us what to fix or build next", icon: MessageSquareWarning, ownerOnly: true },
    ],
  },
];

/** Quick actions shown on Home, Workout and More. */
export const QUICK_ACTIONS = {
  startWorkout: { href: "/dashboard/workout", label: "Start workout", icon: Play },
  importWhatsApp: { href: "/dashboard/import", label: "Import WhatsApp", icon: MessageSquareText },
} as const;

export function moreGroupsFor(role: Role): MoreGroup[] {
  const visible = (i: MoreLink) => !i.ownerOnly || role === OWNER || (role === DEMO && i.demoVisible === true);
  return MORE_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0);
}
