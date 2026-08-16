"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
import { resetPasswordAction } from "@/lib/actions/auth";

function ResetCard() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    startTransition(async () => {
      const result = await resetPasswordAction(token, password);
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto">
          <Logo className="h-12 w-12" />
        </div>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>At least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4 text-center text-sm">
            <p className="text-muted-foreground">
              Your password has been updated.
            </p>
            <Button asChild className="w-full">
              <Link href="/signin">Back to sign in</Link>
            </Button>
          </div>
        ) : !token ? (
          <p className="text-center text-sm text-destructive">
            Missing reset token.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={null}>
        <ResetCard />
      </Suspense>
    </div>
  );
}
