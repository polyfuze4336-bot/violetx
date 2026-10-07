import Link from "next/link";
import { Clock, Dumbbell, MapPin } from "lucide-react";

import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import type { WorkoutListItemDTO } from "@/lib/services/workout";

/** Compact list of finished workouts. */
export function RecentWorkouts({ items, title = "Recent workouts" }: { items: WorkoutListItemDTO[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link href="/dashboard/workouts" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="grid gap-3">
        {items.map((w) => (
          <Card key={w.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{w.name ?? w.exercises.slice(0, 2).join(", ") ?? "Workout"}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{formatDate(w.date)}</span>
                {w.durationMin !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {w.durationMin} min
                  </span>
                )}
                {w.gym && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {w.gym}
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-right">
              <div>
                <p className="text-lg font-bold tabular-nums">{w.sets}</p>
                <p className="text-[10px] uppercase text-muted-foreground">sets</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">{(w.volumeKg / 1000).toFixed(1)}t</p>
                <p className="text-[10px] uppercase text-muted-foreground">volume</p>
              </div>
              <Dumbbell className="hidden h-5 w-5 text-primary sm:block" />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
