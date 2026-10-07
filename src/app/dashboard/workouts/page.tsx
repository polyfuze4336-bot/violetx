import { Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { workoutService } from "@/lib/services/workout";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RecentWorkouts } from "@/components/workout/recent-workouts";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function WorkoutsPage() {
  const viewer = await requireAuth();
  const items = viewer.athleteId ? await workoutService.listSessions(60) : [];
  const done = items.filter((i) => i.status === "COMPLETED");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workouts"
        description="Every workout you have logged."
        action={
          viewer.role === "OWNER" ? (
            <Button asChild>
              <Link href="/dashboard/workout">Start workout</Link>
            </Button>
          ) : undefined
        }
      />
      {done.length === 0 ? (
        <EmptyState icon={Dumbbell} title="No workouts logged yet" />
      ) : (
        <RecentWorkouts items={done} title="Workout log" />
      )}
    </div>
  );
}
