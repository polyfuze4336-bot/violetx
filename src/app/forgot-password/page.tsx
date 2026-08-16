"use client";

import { useState, useTransition } from "react";
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
import { requestPasswordResetAction } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    startTransition(async () => {
      const result = await requestPasswordResetAction(email);
      setSubmitted(true);
      if (result.ok && result.data.devToken) {
        setDevLink(`/reset-password?token=${result.data.devToken}`);
      }
    });
  }

  return (
    <div className="app-surface flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto">
            <Logo className="h-12 w-12" />
          </div>
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll create a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center text-sm">
              <p className="text-muted-foreground">
                If an account exists for that email, a reset link has been
                created.
              </p>
              {devLink && (
                <p className="break-all rounded-lg bg-muted px-3 py-2 text-xs">
                  Dev link:{" "}
                  <Link href={devLink} className="text-primary underline">
                    {devLink}
                  </Link>
                </p>
              )}
              <Link
                href="/signin"
                className="text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isPending}
              >
                {isPending ? "Sending…" : "Send reset link"}
              </Button>
              <div className="text-center text-sm">
                <Link
                  href="/signin"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
