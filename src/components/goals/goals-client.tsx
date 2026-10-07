"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Flag, Plus, Target } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { createGoalAction, updateGoalAction } from "@/lib/actions/goals";
import { trajectoryText, GOAL_TYPES, type GoalType } from "@/lib/goals";
import { formatDate } from "@/lib/format";
import type { GoalDTO } from "@/lib/services/goal";

const TYPE_LABEL: Record<GoalType, string> = {
  BODY_WEIGHT: "Body weight",
  WAIST: "Waist",
  STRENGTH: "Strength (est. 1RM)",
  WORKOUT_FREQUENCY: "Weekly workouts",
  CONSISTENCY: "Training consistency",
  CUSTOM: "Custom",
};

function Ring({ pct, achieved }: { pct: number; achieved: boolean }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[72px] w-[72px] shrink-0">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          className={achieved ? "stroke-success" : "stroke-primary"}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {achieved ? <Check className="h-5 w-5 text-success" /> : `${pct}%`}
      </span>
    </div>
  );
}

export function GoalCard({ goal, isOwner }: { goal: GoalDTO; isOwner: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const p = goal.progress;
  const unit = goal.unit && !goal.unit.startsWith("/") ? ` ${goal.unit}` : goal.unit;

  async function archive() {
    const res = await updateGoalAction({ id: goal.id, status: "ARCHIVED" });
    if (res.ok) {
      toast({ title: "Goal archived" });
      router.refresh();
    } else toast({ title: "Could not archive", description: res.error, variant: "destructive" });
  }

  return (
    <Card className="flex items-center gap-4 p-4">
      <Ring pct={p.pct} achieved={p.achieved} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{goal.title}</p>
            <p className="text-xs text-muted-foreground">
              {TYPE_LABEL[goal.type]}
              {goal.targetDate ? ` · by ${formatDate(goal.targetDate)}` : ""}
            </p>
          </div>
          {isOwner && (
            <Button size="icon" variant="ghost" aria-label="Archive goal" onClick={archive}>
              <Archive className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm tabular-nums">
          <span>
            <span className="text-xs text-muted-foreground">Now </span>
            <span className="font-bold">{p.current ?? "—"}</span>
            {p.current !== null ? unit : ""}
          </span>
          {p.start !== null && goal.type !== "WORKOUT_FREQUENCY" && (
            <span className="text-muted-foreground">
              <span className="text-xs">Start </span>
              {p.start}
            </span>
          )}
          <span>
            <span className="text-xs text-muted-foreground">Target </span>
            <span className="font-bold">{p.target}</span>
            {unit}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", p.achieved ? "bg-success" : "bg-brand-gradient")} style={{ width: `${p.pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {p.detail ? `${p.detail} · ` : ""}
          {trajectoryText(p.trajectory, goal.unit.replace("/", ""))}
        </p>
      </div>
    </Card>
  );
}

function NewGoalDialog({ exercises }: { exercises: { id: string; name: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<GoalType>("BODY_WEIGHT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    setBusy(true);
    setError(null);
    const res = await createGoalAction({
      type,
      title: get("title"),
      exerciseId: get("exerciseId"),
      targetValue: Number(f.get("target")),
      currentValue: get("current") ? Number(f.get("current")) : undefined,
      weeklyTarget: get("weekly") ? Number(f.get("weekly")) : undefined,
      unit: type === "CUSTOM" ? get("unit") : undefined,
      targetDate: get("date"),
    });
    setBusy(false);
    if (res.ok) {
      toast({ title: "Goal created" });
      setOpen(false);
      router.refresh();
    } else setError(res.error);
  }

  const targetLabel =
    type === "WORKOUT_FREQUENCY" ? "Workouts per week" : type === "CONSISTENCY" ? "Consecutive weeks" : type === "BODY_WEIGHT" ? "Target weight (kg)" : type === "WAIST" ? "Target waist (cm)" : type === "STRENGTH" ? "Target estimated 1RM (kg)" : "Target value";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New goal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-type">Type</Label>
            <select id="g-type" value={type} onChange={(e) => setType(e.target.value as GoalType)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {GOAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {type === "STRENGTH" && (
            <div className="space-y-1.5">
              <Label htmlFor="g-ex">Exercise</Label>
              <select id="g-ex" name="exerciseId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Choose…</option>
                {exercises.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {type === "CUSTOM" && (
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="g-title">Name</Label>
                <Input id="g-title" name="title" required maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-unit">Unit</Label>
                <Input id="g-unit" name="unit" maxLength={16} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-target">{targetLabel}</Label>
              <Input id="g-target" name="target" type="number" step="0.1" min="0.1" required />
            </div>
            {type === "CUSTOM" ? (
              <div className="space-y-1.5">
                <Label htmlFor="g-current">Current value</Label>
                <Input id="g-current" name="current" type="number" step="0.1" min="0" />
              </div>
            ) : type === "CONSISTENCY" ? (
              <div className="space-y-1.5">
                <Label htmlFor="g-weekly">Sessions / week</Label>
                <Input id="g-weekly" name="weekly" type="number" min="1" max="14" defaultValue="3" />
              </div>
            ) : type !== "WORKOUT_FREQUENCY" ? (
              <div className="space-y-1.5">
                <Label htmlFor="g-date">Target date</Label>
                <Input id="g-date" name="date" type="date" />
              </div>
            ) : null}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              Create goal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GoalsClient({
  goals,
  exercises,
  isOwner,
}: {
  goals: GoalDTO[];
  exercises: { id: string; name: string }[];
  isOwner: boolean;
}) {
  const active = goals.filter((g) => g.status === "ACTIVE" && !g.progress.achieved);
  const achieved = goals.filter((g) => g.status === "ACHIEVED" || (g.status === "ACTIVE" && g.progress.achieved));
  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="flex justify-end">
          <NewGoalDialog exercises={exercises} />
        </div>
      )}
      {active.length === 0 && achieved.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Target className="h-8 w-8 text-primary" />
          No goals yet.{isOwner ? " Create one to track your trajectory." : ""}
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} isOwner={isOwner} />
            ))}
          </div>
          {achieved.length > 0 && (
            <div className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Flag className="h-4 w-4" /> Achieved
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {achieved.map((g) => (
                  <GoalCard key={g.id} goal={g} isOwner={isOwner} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
