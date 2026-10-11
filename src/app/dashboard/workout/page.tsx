import Link from "next/link";
import { redirect } from "next/navigation";
import { Dumbbell, MessageSquareText } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { workoutService } from "@/lib/services/workout";
import { programService } from "@/lib/services/program";
import { TodayCard } from "@/components/programs/today-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ActiveWorkout } from "@/components/workout/active-workout";
import { StartWorkout } from "@/components/workout/start-workout";
import { RecentWorkouts } from "@/components/workout/recent-workouts";
import { EmptyState } from "@/components/dashboard/empty-state";
import { WorkoutTabs } from "@/components/dashboard/section-tabs";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") redirect("/dashboard/workouts");
  if (!viewer.athleteId) {
    return <EmptyState icon={Dumbbell} title="No athlete profile yet" />;
  }

  const [active, exercises, recent, today] = await Promise.all([
    workoutService.getActive(),
    exerciseService.list(),
    workoutService.listSessions(5),
    programService.today(),
  ]);
  const library = exercises
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment }));

  if (active) {
    return <ActiveWorkout initial={active} library={library} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WorkoutTabs role={viewer.role} />
      <PageHeader
        title="Workout"
        description="Start a workout and log sets as you go."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/import">
              <MessageSquareText className="h-4 w-4" /> Import WhatsApp
            </Link>
          </Button>
        }
      />
      {today && <TodayCard today={today} canStart />}
      <StartWorkout library={library} label={today ? "Start a different workout" : "Start workout"} />
      <RecentWorkouts items={recent.filter((r) => r.status === "COMPLETED")} />
    </div>
  );
}
