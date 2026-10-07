import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { programService } from "@/lib/services/program";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProgramsClient } from "@/components/programs/programs-client";

export default async function ProgramsPage() {
  const viewer = await requireAuth();
  const isOwner = viewer.role === "OWNER";
  const [programs, exercises] = viewer.athleteId
    ? await Promise.all([programService.list(), exerciseService.list()])
    : [[], []];
  const library = exercises
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment }));

  return (
    <div className="space-y-6">
      <PageHeader title="Programs" description="Training programs and the workouts inside them." />
      <ProgramsClient programs={programs} library={library} isOwner={isOwner} />
    </div>
  );
}
