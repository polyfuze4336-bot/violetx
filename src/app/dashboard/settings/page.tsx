import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { athleteService } from "@/lib/services/athlete";
import { measurementService } from "@/lib/services/measurement";
import { userAdminService } from "@/lib/services/userAdmin";
import { shareLinkService } from "@/lib/services/shareLink";
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
import { CoachManager } from "@/components/settings/coach-manager";
import { ShareLinkManager } from "@/components/settings/share-link-manager";
import { TrustedImportsToggle } from "@/components/settings/trusted-imports-toggle";

export default async function SettingsPage() {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") {
    redirect("/dashboard");
  }

  const [profile, types, coach, shareLinks] = await Promise.all([
    athleteService.getProfile(),
    measurementService.listTypes(),
    userAdminService.getCoach(),
    shareLinkService.list(),
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Violet AI imports</CardTitle>
            <CardDescription>
              Control how much Violet can do on its own when interpreting your
              updates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrustedImportsToggle enabled={profile.trustedAiImports} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coach access</CardTitle>
            <CardDescription>
              Give your coach a read-only account. They can view your progress
              but cannot make changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoachManager coach={coach} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share With Coach</CardTitle>
            <CardDescription>
              Let a coach view your progress without an account or login. The
              link is private and unguessable, read-only, optionally expires and
              can be revoked any time. Notes and nutrition are never shared.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShareLinkManager links={shareLinks} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
