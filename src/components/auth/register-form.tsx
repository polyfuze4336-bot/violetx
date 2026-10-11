"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/lib/actions/auth";

/** Email + password sign-up. On success the new account is signed in straight away. */
export function RegisterForm() {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setErrors({});
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      const res = await registerAction({
        email,
        password,
        confirmPassword: String(data.get("confirmPassword") ?? ""),
        website: String(data.get("website") ?? ""),
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setError(res.fieldErrors ? null : res.error);
        setBusy(false);
        return;
      }
      const result = await signIn("credentials", { email: res.data.email, password, redirect: false });
      if (result?.ok && !result.error) {
        window.location.assign("/dashboard");
        return;
      }
      // The account exists; only the automatic sign-in failed.
      window.location.assign("/signin");
    } catch {
      setError("Could not create the account. Check your connection and try again.");
      setBusy(false);
    }
  }

  const field = (name: string) => errors[name]?.[0];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
        {field("email") && <p className="text-xs text-destructive">{field("email")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">At least 10 characters, with a letter and a number.</p>
        {field("password") && <p className="text-xs text-destructive">{field("password")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
        {field("confirmPassword") && <p className="text-xs text-destructive">{field("confirmPassword")}</p>}
      </div>
      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
