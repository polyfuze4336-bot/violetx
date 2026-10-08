import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/signin-form";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerAuthSession } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/auth-redirect";
import { isDemoModeEnabled } from "@/lib/demo-mode";

// Depends on the session and the deployment's demo setting: never cached.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  const callbackUrl = safeCallbackUrl(searchParams.callbackUrl);
  // Already signed in: go straight on instead of showing the form again.
  const session = await getServerAuthSession().catch(() => null);
  if (session?.user?.id && (session.user.role !== "DEMO_VIEWER" || isDemoModeEnabled())) {
    redirect(callbackUrl);
  }

  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto">
            <Logo className="h-14 w-14" />
          </div>
          <CardTitle className="text-2xl">Welcome to VioletX</CardTitle>
          <CardDescription>Sign in to view fitness progress and your gym journey.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm callbackUrl={callbackUrl} demoEnabled={isDemoModeEnabled()} initialError={Boolean(searchParams.error)} />
        </CardContent>
      </Card>
    </div>
  );
}
