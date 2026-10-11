import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Any signed-in account (except the shared demo) can change its own password. */
export default async function ChangePasswordPage() {
  const viewer = await requireAuth();
  if (viewer.role === "DEMO_VIEWER") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="Change password" description="Choose a new password for your account." />
      <Card>
        <CardContent className="p-5">
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        You stay signed in on this device. Other devices keep their session until it expires (up to 8 hours) or they sign out.
      </p>
    </div>
  );
}
