"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toDateInputValue } from "@/lib/format";
import { createExerciseEntryAction } from "@/lib/actions/exercise";
import type { ExerciseDTO } from "@/lib/dto";

export function SetForm({ exercises }: { exercises: ExerciseDTO[] }) {
  const activeExercises = exercises.filter((ex) => ex.active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [exerciseId, setExerciseId] = useState(activeExercises[0]?.id ?? "");
  const [date, setDate] = useState(toDateInputValue());
  const [reps, setReps] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [sets, setSets] = useState("");
  const { toast } = useToast();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createExerciseEntryAction({
        exerciseId,
        date: new Date(date),
        reps: Number(reps),
        weightKg: Number(weightKg),
        sets: sets ? Number(sets) : undefined,
        position: 0,
      });
      if (result.ok) {
        toast({ title: "Set added" });
        setReps("");
        setWeightKg("");
        setSets("");
      } else {
        setError(result.error);
      }
    });
  }

  if (activeExercises.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add an exercise in Settings first.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <Label>Exercise</Label>
          <Select value={exerciseId} onValueChange={setExerciseId}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {activeExercises.map((ex) => (
                <SelectItem key={ex.id} value={ex.id}>
                  {ex.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reps">Reps</Label>
          <Input
            id="reps"
            type="number"
            min="0"
            step="1"
            required
            placeholder="9"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weightKg">Weight (kg)</Label>
          <Input
            id="weightKg"
            type="number"
            min="0"
            step="0.5"
            required
            placeholder="50"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sets">Sets (optional)</Label>
          <Input
            id="sets"
            type="number"
            min="1"
            step="1"
            placeholder="3"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        <Plus className="h-4 w-4" />
        {isPending ? "Saving…" : "Add set"}
      </Button>
    </form>
  );
}
