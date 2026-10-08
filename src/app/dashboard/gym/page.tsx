import { Map } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { gymService } from "@/lib/services/gym";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { GymJourney } from "@/components/gym/gym-journey";
import { PATIENT_LABEL } from "@/lib/constants";
import { showsOwnerUi } from "@/lib/rbac";

export default async function GymJourneyPage() {
  const viewer = await requireAuth();
  const isOwner = showsOwnerUi(viewer.role);

  const [branches, journey] = viewer.athleteId
    ? await Promise.all([gymService.listBranches(), gymService.getJourney()])
    : [[], null];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${PATIENT_LABEL}'s Gym Journey`}
        description="Explore Anytime Fitness branches across Malaysia."
      />

      {branches.length === 0 || !journey ? (
        <EmptyState
          icon={Map}
          title="No gym branches yet"
          description="The gym branch dataset has not been loaded yet."
        />
      ) : (
        <GymJourney branches={branches} journey={journey} isOwner={isOwner} />
      )}
    </div>
  );
}
