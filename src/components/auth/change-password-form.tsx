"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { changePasswordAction } from "@/lib/actions/auth";

export function ChangePasswordForm() {
  const { toast } = useToast();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setErrors({});
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await changePasswordAction({
        currentPassword: String(data.get("currentPassword") ?? ""),
        newPassword: String(data.get("newPassword") ?? ""),
        confirmPassword: String(data.get("confirmPassword") ?? ""),
      });
      if (res.ok) {
        form.reset();
        setDone(true);
        toast({ title: "Password changed", description: "Use your new password next time you sign in." });
      } else {
        setErrors(res.fieldErrors ?? {});
        setError(res.fieldErrors ? null : res.error);
      }
    });
  }

  const field = (name: string) => errors[name]?.[0];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
        {field("currentPassword") && <p className="text-xs text-destructive">{field("currentPassword")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">At least 10 characters, with a letter and a number.</p>
        {field("newPassword") && <p className="text-xs text-destructive">{field("newPassword")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
        {field("confirmPassword") && <p className="text-xs text-destructive">{field("confirmPassword")}</p>}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {done && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">Your password was changed.</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
