"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewDemoButton } from "@/components/auth/view-demo-button";
import { safeCallbackUrl } from "@/lib/auth-redirect";

export function SignInForm({
  callbackUrl,
  demoEnabled,
  initialError,
}: {
  callbackUrl: string;
  demoEnabled: boolean;
  initialError: boolean;
}) {
  const [error, setError] = useState<string | null>(initialError ? "Sign-in failed. Please try again." : null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
        redirect: false,
      });
      if (result?.ok && !result.error) {
        // A full navigation guarantees the new session cookie is used and avoids
        // a stale cached "redirect to sign-in" from the router.
        window.location.assign(safeCallbackUrl(callbackUrl));
        return;
      }
      setError("Invalid username or password.");
    } catch {
      setError("Could not sign in. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {demoEnabled && (
        <>
          <ViewDemoButton callbackUrl={callbackUrl} className="w-full" size="lg" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or sign in
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email or username</Label>
          <Input
            id="email"
            name="email"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" variant={demoEnabled ? "outline" : "default"} className="w-full" size="lg" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
