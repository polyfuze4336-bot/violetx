"use client";

import { Suspense, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";

function SignInCard() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Sign-in failed. Please try again." : null
  );
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");

    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError("Invalid username or password.");
      }
    });
  }

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
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email or username</Label>
            <Input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
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
