import Link from "next/link";
import { Dumbbell, MessageSquareText, Play } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { workoutService } from "@/lib/services/workout";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RecentWorkouts } from "@/components/workout/recent-workouts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkoutListItemDTO } from "@/lib/services/workout";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "workouts", label: "Workouts" },
  { key: "partial", label: "Partial" },
  { key: "updates", label: "PR updates" },
  { key: "whatsapp", label: "WhatsApp imports" },
] as const;

/**
 * Workout > History. Full workouts, partial workouts and PR / progress updates
 * (including what came in from WhatsApp). Partial records and updates are shown
 * as what they are: recorded exercises, not complete workouts.
 */
export default async function WorkoutsPage({ searchParams }: { searchParams?: { show?: string } }) {
  const viewer = await requireAuth();
  const items = viewer.athleteId ? await workoutService.listSessions(100, { includeIncomplete: true }) : [];
  const show = FILTERS.some((f) => f.key === searchParams?.show) ? searchParams!.show! : "all";

  const workouts = items.filter((i) => i.status === "COMPLETED");
  const partial = items.filter((i) => i.status === "PARTIAL");
  const updates = items.filter((i) => i.status === "PR_UPDATE");
  const whatsapp = items.filter((i) => i.fromWhatsApp);

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Previous workouts, partial workouts, PR updates and WhatsApp imports."
        action={
          viewer.role === "OWNER" ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/workout">
                  <Play className="h-4 w-4" /> Start workout
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/import">
                  <MessageSquareText className="h-4 w-4" /> Import WhatsApp
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <nav aria-label="History filter" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/dashboard/workouts" : `/dashboard/workouts?show=${f.key}`}
            aria-current={show === f.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              show === f.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={Dumbbell} title="No workouts logged yet" />
      ) : show !== "all" ? (
        <FilteredList
          items={{ whatsapp, partial, updates, workouts }[show as "whatsapp" | "partial" | "updates" | "workouts"]}
          title={{ whatsapp: "WhatsApp imports", partial: "Partial workouts", updates: "PR / progress updates", workouts: "Previous workouts" }[show]!}
        />
      ) : (
        <>
          <RecentWorkouts items={workouts} title="Previous workouts" showViewAll={false} />
          <RecentWorkouts items={partial} title="Partial workouts" showViewAll={false} />
          <RecentWorkouts items={updates} title="PR / progress updates" showViewAll={false} />
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Looking for everything by date?{" "}
        <Link href="/dashboard/history" className="font-medium text-primary hover:underline">
          Open the day-by-day log
        </Link>
        .
      </p>
    </div>
  );
}

function FilteredList({ items, title }: { items: WorkoutListItemDTO[]; title: string }) {
  if (items.length === 0) {
    return <EmptyState icon={Dumbbell} title="Nothing here yet" description={`No ${title.toLowerCase()} recorded.`} />;
  }
  return <RecentWorkouts items={items} title={title} showViewAll={false} />;
}
