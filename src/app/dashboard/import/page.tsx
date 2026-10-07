import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { athleteService } from "@/lib/services/athlete";
import { measurementService } from "@/lib/services/measurement";
import { PageHeader } from "@/components/dashboard/page-header";
import { ImportClient } from "@/components/import/import-client";

export default async function ImportPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") {
    redirect("/dashboard");
  }

  const [types, profile] = viewer.athleteId
    ? await Promise.all([
        measurementService.listTypes(),
        athleteService.getProfile(),
      ])
    : [[], null];

  return (
    <div>
      <PageHeader
        title="Import from WhatsApp"
        description="Upload a WhatsApp chat export or paste a message and turn it into structured fitness records."
      />
      <ImportClient
        types={types}
        defaultMeasurementUnit={profile?.defaultMeasurementUnit ?? "CM"}
      />
    </div>
  );
}
