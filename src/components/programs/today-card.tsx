"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Dumbbell, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { startWorkoutAction } from "@/lib/actions/workout";
import type { TodayWorkoutDTO } from "@/lib/services/program";

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Today" hero: the next workout of the active program with a Start button. */
export function TodayCard({ today, canStart }: { today: TodayWorkoutDTO; canStart: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const t = today.template;

  async function start() {
    setBusy(true);
    const res = await startWorkoutAction({ date: localDate(), templateId: t.id });
    if (res.ok) router.push("/dashboard/workout");
    else {
      setBusy(false);
      toast({ title: "Could not start workout", description: res.error, variant: "destructive" });
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
      <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gradient opacity-10 blur-2xl" />
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Today</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight">{t.name}</h2>
      <p className="text-sm text-muted-foreground">
        {today.program.name} · {t.exercises.length} exercises · ~{t.estimatedMinutes} min
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {t.exercises.slice(0, 6).map((e) => (
          <li key={e.exerciseId} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
            <Dumbbell className="h-3 w-3 text-primary" /> {e.exerciseName}
          </li>
        ))}
        {t.exercises.length > 6 && <li className="px-1 py-1 text-xs text-muted-foreground">+{t.exercises.length - 6}</li>}
      </ul>
      {canStart && (
        <Button onClick={start} disabled={busy} className="mt-4 h-12 w-full text-base font-semibold sm:w-auto">
          <Play className="h-4 w-4" /> Start workout <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
