import { requireAuth } from "@/lib/auth";
import { exerciseService } from "@/lib/services/exercise";
import { goalService } from "@/lib/services/goal";
import { PageHeader } from "@/components/dashboard/page-header";
import { GoalsClient } from "@/components/goals/goals-client";
import { showsOwnerUi } from "@/lib/rbac";

export default async function GoalsPage() {
  const viewer = await requireAuth();
  const [goals, exercises] = viewer.athleteId
    ? await Promise.all([goalService.list(), exerciseService.list()])
    : [[], []];
  return (
    <div className="space-y-6">
      <PageHeader title="Goals" description="Where you are heading and how the trajectory looks." />
      <GoalsClient
        goals={goals}
        exercises={exercises.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))}
        isOwner={showsOwnerUi(viewer.role)}
      />
    </div>
  );
}
