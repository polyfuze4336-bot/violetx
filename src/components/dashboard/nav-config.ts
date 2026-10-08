import {
  CalendarCheck,
  LineChart,
  BarChart3,
  HeartPulse,
  Target,
  ClipboardList,
  Dumbbell,
  Play,
  History,
  Home,
  Map,
  MessageSquareText,
  Ruler,
  Salad,
  Settings,
  Sparkles,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from coaches (read-only users). */
  ownerOnly?: boolean;
  /** Owner-only, but its read-only view works for the demo viewer. */
  demoVisible?: boolean;
  /** Shown in the mobile bottom navigation bar (most common actions). */
  bottomNav?: boolean;
  /** Shown in the bottom bar for coaches only (replaces owner-only slots). */
  coachBottomNav?: boolean;
  /** Compact label for the bottom bar. */
  shortLabel?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home, bottomNav: true },
  {
    href: "/dashboard/workout",
    label: "Workout",
    icon: Play,
    ownerOnly: true,
    bottomNav: true,
  },
  {
    href: "/dashboard/workouts",
    label: "Workout log",
    shortLabel: "Workouts",
    icon: Dumbbell,
    coachBottomNav: true,
  },
  { href: "/dashboard/programs", label: "Programs", icon: ClipboardList },
  { href: "/dashboard/review", label: "Weekly review", icon: CalendarCheck },
  { href: "/dashboard/goals", label: "Goals", icon: Target, coachBottomNav: true },
  { href: "/dashboard/recovery", label: "Recovery", icon: HeartPulse },
  {
    href: "/dashboard/coach",
    label: "AI Coach",
    shortLabel: "Violet",
    icon: Sparkles,
    ownerOnly: true,
    demoVisible: true,
    bottomNav: true,
  },
  {
    href: "/dashboard/progress",
    label: "Training",
    shortLabel: "Progress",
    icon: BarChart3,
    bottomNav: true,
  },
  { href: "/dashboard/analytics", label: "Analytics", icon: LineChart },
  { href: "/dashboard/weight", label: "Body weight", icon: TrendingUp },
  {
    href: "/dashboard/strength",
    label: "Strength",
    icon: Dumbbell,
  },
  { href: "/dashboard/measurements", label: "Measurements", icon: Ruler },
  {
    href: "/dashboard/nutrition",
    label: "Nutrition",
    icon: Salad,
    ownerOnly: true,
    demoVisible: true,
  },
  { href: "/dashboard/gym", label: "Gym Journey", icon: Map },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/records", label: "Records", icon: Trophy },
  {
    href: "/dashboard/import",
    label: "Import",
    icon: MessageSquareText,
    ownerOnly: true,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    ownerOnly: true,
  },
];
