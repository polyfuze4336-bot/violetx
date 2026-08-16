import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { aiProviderLabel } from "@/ai/client";
import { PageHeader } from "@/components/dashboard/page-header";
import { VioletChat } from "@/components/ai/violet-chat";
import { PATIENT_LABEL } from "@/lib/constants";

export default async function CoachPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Violet, your AI coach"
        description={`Chat naturally about your training — Violet turns it into records for ${PATIENT_LABEL} to approve.`}
      />
      <VioletChat provider={aiProviderLabel()} />
    </div>
  );
}
