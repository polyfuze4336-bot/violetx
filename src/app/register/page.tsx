import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerAuthSession } from "@/lib/auth";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { isRegistrationEnabled } from "@/lib/services/registration";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getServerAuthSession().catch(() => null);
  if (session?.user?.id && (session.user.role !== "DEMO_VIEWER" || isDemoModeEnabled())) redirect("/dashboard");
  const open = isRegistrationEnabled();

  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto">
            <Logo className="h-14 w-14" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Your own private tracker. Nobody else can see your data.</CardDescription>
        </CardHeader>
        <CardContent>
          {open ? (
            <RegisterForm />
          ) : (
            <div className="space-y-4 text-center text-sm">
              <p className="text-muted-foreground">Registration is closed at the moment.</p>
              <Link href="/signin" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
