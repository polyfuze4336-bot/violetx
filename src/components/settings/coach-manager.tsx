"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { setCoachAction } from "@/lib/actions/auth";
import { formatDate } from "@/lib/format";
import type { CoachInfo } from "@/lib/services/userAdmin";

export function CoachManager({ coach }: { coach: CoachInfo | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState(coach?.email ?? "");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await setCoachAction({ email: email.trim(), password });
      if (result.ok) {
        setPassword("");
        toast({
          title: coach ? "Coach updated" : "Coach account created",
          description: "The coach has read-only access to your dashboards.",
        });
        router.refresh();
      } else {
        toast({
          title: "Could not save coach",
          description: result.error,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {coach && (
        <p className="text-xs text-muted-foreground">
          Current coach: <span className="font-medium">{coach.email}</span> ·{" "}
          {coach.active ? "active" : "disabled"} · last signed in{" "}
          {coach.lastLoginAt ? formatDate(coach.lastLoginAt) : "never"}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="coach-email">Coach email</Label>
          <Input
            id="coach-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-password">
            {coach ? "New password" : "Password"}
          </Label>
          <Input
            id="coach-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            placeholder="At least 8 characters"
          />
        </div>
      </div>
      <Button type="submit" disabled={isPending}>
        {coach ? "Update coach access" : "Create coach account"}
      </Button>
    </form>
  );
}
