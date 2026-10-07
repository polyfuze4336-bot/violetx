"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Play, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { startWorkoutAction } from "@/lib/actions/workout";
import { ExercisePicker, type PickerExercise } from "@/components/workout/exercise-picker";
import { GymPicker } from "@/components/workout/gym-picker";
import type { GymOptionDTO } from "@/lib/services/gym";

function localDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Start an empty workout or one pre-filled with chosen exercises. */
export function StartWorkout({
  library,
  initialExerciseIds = [],
  initialName = "",
  templateId,
  label = "Start workout",
}: {
  library: PickerExercise[];
  initialExerciseIds?: string[];
  initialName?: string;
  templateId?: string;
  label?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [ids, setIds] = useState<string[]>(initialExerciseIds);
  const [busy, setBusy] = useState(false);
  const [gym, setGym] = useState<GymOptionDTO | null>(null);
  const byId = new Map(library.map((e) => [e.id, e]));

  async function start() {
    setBusy(true);
    const res = await startWorkoutAction({
      date: localDate(),
      name: name.trim() || undefined,
      templateId,
      gymBranchId: gym?.id,
      exerciseIds: ids,
    });
    if (res.ok) router.refresh();
    else {
      setBusy(false);
      toast({ title: "Could not start workout", description: res.error, variant: "destructive" });
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <GymPicker value={gym} onChange={setGym} />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name (optional)" aria-label="Workout name" maxLength={120} />
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-sm">
              <Dumbbell className="h-3.5 w-3.5 text-primary" />
              {byId.get(id)?.name ?? "Exercise"}
              <button type="button" aria-label="Remove exercise" className="rounded-full p-1 hover:bg-muted" onClick={() => setIds(ids.filter((x) => x !== id))}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <ExercisePicker exercises={library.filter((e) => !ids.includes(e.id))} title="Add exercise" onPick={(id) => setIds([...ids, id])}>
          <Button type="button" variant="outline" className="h-12 flex-1">
            <Plus className="h-4 w-4" /> Add exercises
          </Button>
        </ExercisePicker>
        <Button type="button" onClick={start} disabled={busy} className="h-12 flex-1 text-base font-semibold">
          <Play className="h-4 w-4" /> {label}
        </Button>
      </div>
    </Card>
  );
}
