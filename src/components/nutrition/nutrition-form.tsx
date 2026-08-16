"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { toDateInputValue } from "@/lib/format";
import { createNutritionAction } from "@/lib/actions/nutrition";

const FIELDS = [
  { name: "calories", label: "Calories", step: "1" },
  { name: "protein", label: "Protein (g)", step: "0.1" },
  { name: "carbohydrates", label: "Carbs (g)", step: "0.1" },
  { name: "fat", label: "Fat (g)", step: "0.1" },
  { name: "fibre", label: "Fibre (g)", step: "0.1" },
  { name: "water", label: "Water (L)", step: "0.1" },
] as const;

export function NutritionForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const numOrUndef = (k: string) => {
      const v = String(data.get(k) ?? "");
      return v === "" ? undefined : Number(v);
    };

    startTransition(async () => {
      const result = await createNutritionAction({
        entryDate: new Date(String(data.get("entryDate"))),
        calories: numOrUndef("calories"),
        protein: numOrUndef("protein"),
        carbohydrates: numOrUndef("carbohydrates"),
        fat: numOrUndef("fat"),
        fibre: numOrUndef("fibre"),
        water: numOrUndef("water"),
        notes: String(data.get("notes") ?? "") || undefined,
      });
      if (result.ok) {
        toast({ title: "Nutrition logged" });
        form.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="entryDate">Date</Label>
          <Input
            id="entryDate"
            name="entryDate"
            type="date"
            required
            defaultValue={toDateInputValue()}
          />
        </div>
        {FIELDS.map((f) => (
          <div key={f.name} className="space-y-2">
            <Label htmlFor={f.name}>{f.label}</Label>
            <Input id={f.name} name={f.name} type="number" min="0" step={f.step} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Meals, how you felt…" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        <Plus className="h-4 w-4" />
        {isPending ? "Saving…" : "Log nutrition"}
      </Button>
    </form>
  );
}
