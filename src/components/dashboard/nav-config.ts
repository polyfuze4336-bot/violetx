import {
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
  /** Shown in the mobile bottom navigation bar (most common actions). */
  bottomNav?: boolean;
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
  { href: "/dashboard/workouts", label: "Workout log", icon: Dumbbell },
  { href: "/dashboard/programs", label: "Programs", icon: ClipboardList },
  { href: "/dashboard/goals", label: "Goals", icon: Target },
  { href: "/dashboard/recovery", label: "Recovery", icon: HeartPulse },
  {
    href: "/dashboard/coach",
    label: "AI Coach",
    icon: Sparkles,
    ownerOnly: true,
    bottomNav: true,
  },
  {
    href: "/dashboard/progress",
    label: "Training",
    icon: BarChart3,
    bottomNav: true,
  },
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
