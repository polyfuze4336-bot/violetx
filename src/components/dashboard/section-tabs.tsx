"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { PROGRESS_TABS, WORKOUT_TABS, isTabActive, tabsFor, type SectionTab } from "@/components/dashboard/nav-config";
import type { Role } from "@/lib/rbac";

/**
 * Tabs inside a primary destination (Workout: Today / History / Programs /
 * Exercises; Progress: Overview / PRs / Exercises / Body). They link to the
 * existing pages, so no route changed and every bookmark still works.
 */
export function SectionTabs({ tabs, label, role }: { tabs: SectionTab[]; label: string; role?: Role | null }) {
  const pathname = usePathname();
  const visible = tabsFor(tabs, role);
  const active = visible.find((t) => isTabActive(t, pathname));

  return (
    <div className="mb-6 space-y-3">
      <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <ul className="flex min-w-max gap-1 rounded-2xl border bg-card p-1">
          {visible.map((tab) => {
            const on = tab === active;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "block rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                    on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {active?.sub && (
        <nav aria-label={`${active.label} sections`} className="flex gap-2">
          {active.sub.map((s) => {
            const on = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export const WorkoutTabs = ({ role }: { role?: Role | null }) => <SectionTabs tabs={WORKOUT_TABS} label="Workout sections" role={role} />;
export const ProgressTabs = ({ role }: { role?: Role | null }) => <SectionTabs tabs={PROGRESS_TABS} label="Progress sections" role={role} />;
