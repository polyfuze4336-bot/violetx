"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { updateAthleteProfileAction } from "@/lib/actions/note";

export function TrustedImportsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    startTransition(async () => {
      const result = await updateAthleteProfileAction({ trustedAiImports: next });
      if (!result.ok) {
        setOn(!next);
        toast({
          title: "Could not update",
          description: result.error,
          variant: "destructive",
        });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Auto-approve high-confidence imports</p>
        <p className="text-xs text-muted-foreground">
          When on, Violet may save records it recognises with high confidence
          without a manual review step. Duplicates and low-confidence items still
          always ask first. Off is the safer default.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Auto-approve high-confidence imports"
        onClick={toggle}
        disabled={isPending}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
          on ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-background shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0.5"
          )}
        >
          {on && <Check className="h-3 w-3 text-primary" />}
        </span>
      </button>
    </div>
  );
}
