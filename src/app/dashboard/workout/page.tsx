import { redirect } from "next/navigation";
import { Dumbbell } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { workoutService } from "@/lib/services/workout";
import { PageHeader } from "@/components/dashboard/page-header";
import { ActiveWorkout } from "@/components/workout/active-workout";
import { StartWorkout } from "@/components/workout/start-workout";
import { RecentWorkouts } from "@/components/workout/recent-workouts";
import { EmptyState } from "@/components/dashboard/empty-state";

export const dynamic = "force-dynamic";

export default async function WorkoutPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") redirect("/dashboard/workouts");
  if (!viewer.athleteId) {
    return <EmptyState icon={Dumbbell} title="No athlete profile yet" />;
  }

  const [active, exercises, recent] = await Promise.all([
    workoutService.getActive(),
    exerciseService.list(),
    workoutService.listSessions(5),
  ]);
  const library = exercises
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment }));

  if (active) {
    return <ActiveWorkout initial={active} library={library} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Workout" description="Start a workout and log sets as you go." />
      <StartWorkout library={library} />
      <RecentWorkouts items={recent.filter((r) => r.status === "COMPLETED")} />
    </div>
  );
}
