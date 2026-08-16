import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { athleteService } from "@/lib/services/athlete";
import { measurementService } from "@/lib/services/measurement";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { MeasurementTypeManager } from "@/components/settings/measurement-type-manager";

export default async function SettingsPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") {
    redirect("/dashboard");
  }

  const [profile, types] = await Promise.all([
    athleteService.getProfile(),
    measurementService.listTypes(),
  ]);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your profile and the measurements you track."
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Athlete profile</CardTitle>
            <CardDescription>
              Used across your dashboards and reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Measurements</CardTitle>
            <CardDescription>
              Define the body measurements you track and their default units.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MeasurementTypeManager types={types} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
