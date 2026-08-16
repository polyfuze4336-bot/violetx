"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";

function SignInCard() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const error = params.get("error");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto">
          <Logo className="h-14 w-14" />
        </div>
        <CardTitle className="text-2xl">Welcome to VioletX</CardTitle>
        <CardDescription>
          Sign in to view fitness progress and your gym journey.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            Sign-in failed or access was denied. Please try again.
          </p>
        )}
        <Button
          className="w-full"
          size="lg"
          onClick={() => signIn("azure-ad", { callbackUrl })}
        >
          Sign in with Microsoft
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Coaches receive read-only access. The athlete has full access.
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={null}>
        <SignInCard />
      </Suspense>
    </div>
  );
}
