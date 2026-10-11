"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SpellCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { applyExerciseNameFixAction } from "@/lib/actions/exercise";
import type { NameFixProposal } from "@/lib/exercise-name-review";

/**
 * Corrects spelling mistakes and duplicates among exercises that are already
 * saved. Nothing changes until the user confirms each correction.
 */
export function ExerciseNameCleanup({ proposals }: { proposals: NameFixProposal[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const open = proposals.filter((p) => !dismissed.has(p.exerciseId));
  if (open.length === 0) return null;

  function apply(p: NameFixProposal) {
    setBusy(p.exerciseId);
    startTransition(async () => {
      const res = await applyExerciseNameFixAction({ exerciseId: p.exerciseId, action: p.action, targetRef: p.targetRef });
      setBusy(null);
      if (res.ok) {
        toast({ title: p.action === "RENAME" ? "Exercise renamed" : "Exercises merged", description: `${p.name} is now ${res.data.name}.` });
        setDismissed((d) => new Set(d).add(p.exerciseId));
        router.refresh();
      } else {
        toast({ title: "Could not apply the correction", description: res.error, variant: "destructive" });
      }
    });
  }

  return (
    <Card className="border-amber-300/60 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SpellCheck className="h-4 w-4 text-amber-600" />
          Possible spelling mistakes ({open.length})
        </CardTitle>
        <CardDescription>
          These saved exercises look like misspellings or duplicates. Confirm a correction to fix them. Your history is kept: a rename keeps every set, and a merge moves the sets to the other exercise.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.map((p) => (
          <div key={p.exerciseId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                {p.name} <span className="text-muted-foreground">→</span> {p.targetName}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.reason === "DUPLICATE" ? "Same exercise saved twice" : "Looks misspelled"} · {p.entryCount} recorded set{p.entryCount === 1 ? "" : "s"}
                {p.action === "MERGE" ? " will move to " + p.targetName : " stay with it"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => apply(p)} disabled={busy !== null}>
                {busy === p.exerciseId ? "Applying…" : p.action === "RENAME" ? `Rename to ${p.targetName}` : `Merge into ${p.targetName}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed((d) => new Set(d).add(p.exerciseId))} disabled={busy !== null}>
                Keep as is
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
