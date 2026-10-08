"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteButton } from "@/components/dashboard/delete-button";
import { ExerciseNameCheck, type NameDecision } from "@/components/exercises/exercise-name-check";
import { parseExerciseRef } from "@/lib/exercise-matching";
import type { ExerciseSuggestionDTO } from "@/lib/services/exerciseMatch";
import {
  addStarterExerciseAction,
  suggestExercisesAction,
  createExerciseAction,
  deleteExerciseAction,
  updateExerciseAction,
} from "@/lib/actions/exercise";
import { EXERCISE_CATEGORIES } from "@/lib/schemas";
import type { ExerciseDTO } from "@/lib/dto";

export function ExerciseManager({ exercises }: { exercises: ExerciseDTO[] }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<ExerciseSuggestionDTO | null>(null);
  const { toast } = useToast();

  function reset() {
    setName("");
    setCategory("");
    setMuscleGroup("");
    setEquipment("");
    setSuggestion(null);
  }

  function pickExisting(d: NameDecision | null) {
    if (d?.kind !== "ref") return;
    const ref = parseExerciseRef(d.ref);
    startTransition(async () => {
      if (ref?.kind === "starter") {
        const res = await addStarterExerciseAction(ref.name);
        if (!res.ok) return setError(res.error);
      }
      toast({ title: ref?.kind === "starter" ? `${d.name} added` : `Using existing ${d.name}` });
      reset();
    });
  }

  function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Saving again with a suggestion showing keeps the name as a new exercise.
      if (!suggestion) {
        const check = await suggestExercisesAction([name]);
        const s = check.ok ? check.data[0] : undefined;
        if (s && s.status !== "NONE") {
          setSuggestion(s.status === "EXACT" ? { ...s, status: "HIGH" } : s);
          return;
        }
      }
      const result = await createExerciseAction({
        name,
        category: category || undefined,
        muscleGroup: muscleGroup || undefined,
        equipment: equipment || undefined,
        active: true,
      });
      if (result.ok) {
        toast({ title: "Exercise added" });
        reset();
      } else {
        setError(result.error);
      }
    });
  }

  function toggleActive(ex: ExerciseDTO) {
    startTransition(async () => {
      const result = await updateExerciseAction({
        id: ex.id,
        active: !ex.active,
      });
      if (!result.ok) {
        toast({
          title: "Could not update",
          description: result.error,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAdd} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSuggestion(null);
              }}
              placeholder="Chest press"
              required
            />
            {suggestion && (
              <ExerciseNameCheck
                name={name}
                suggestion={suggestion}
                decision={null}
                onDecide={(d) => {
                  if (d?.kind === "custom") {
                    // Keep as new: createExerciseAction runs on the next submit.
                    setSuggestion({ ...suggestion, status: "NONE" });
                  } else pickExisting(d);
                }}
              />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {EXERCISE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Muscle group</label>
            <Input
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value)}
              placeholder="Pectorals"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Equipment</label>
            <Input
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="Machine"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isPending || !name.trim()}>
          <Plus className="h-4 w-4" />
          Add exercise
        </Button>
      </form>

      <ul className="divide-y rounded-md border">
        {exercises.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">
            No exercises yet.
          </li>
        )}
        {exercises.map((ex) => (
          <li
            key={ex.id}
            className="flex items-center justify-between gap-2 p-3 text-sm"
          >
            <div>
              <span className={ex.active ? "" : "text-muted-foreground"}>
                {ex.name}
              </span>
              {(ex.category || ex.muscleGroup) && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {[ex.category, ex.muscleGroup].filter(Boolean).join(" · ")}
                </span>
              )}
              {!ex.active && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  (inactive)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => toggleActive(ex)}
              >
                {ex.active ? "Deactivate" : "Activate"}
              </Button>
              <ConfirmDeleteButton
                onConfirm={deleteExerciseAction.bind(null, ex.id)}
                title="Delete this exercise?"
                description="Exercises with recorded sets cannot be deleted."
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
