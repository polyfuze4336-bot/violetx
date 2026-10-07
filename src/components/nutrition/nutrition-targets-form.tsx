"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { saveNutritionTargetsAction } from "@/lib/actions/nutrition";
import type { NutritionTargets } from "@/lib/nutrition-intel";

const FIELDS: { key: keyof NutritionTargets; label: string; step: string }[] = [
  { key: "calories", label: "Calories (kcal)", step: "1" },
  { key: "protein", label: "Protein (g)", step: "1" },
  { key: "carbohydrates", label: "Carbs (g)", step: "1" },
  { key: "fat", label: "Fat (g)", step: "1" },
  { key: "waterL", label: "Water (L)", step: "0.1" },
];

export function NutritionTargetsForm({ targets }: { targets: NutritionTargets }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await saveNutritionTargetsAction({
      calories: String(f.get("calories") ?? ""),
      protein: String(f.get("protein") ?? ""),
      carbohydrates: String(f.get("carbohydrates") ?? ""),
      fat: String(f.get("fat") ?? ""),
      waterL: String(f.get("waterL") ?? ""),
    });
    setBusy(false);
    if (res.ok) {
      toast({ title: "Targets saved" });
      router.refresh();
    } else toast({ title: "Could not save targets", description: res.error, variant: "destructive" });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`t-${f.key}`} className="text-xs">
              {f.label}
            </Label>
            <Input id={`t-${f.key}`} name={f.key} type="number" step={f.step} min="0" defaultValue={targets[f.key] ?? ""} />
          </div>
        ))}
      </div>
      <Button type="submit" disabled={busy} size="sm">
        Save targets
      </Button>
    </form>
  );
}
