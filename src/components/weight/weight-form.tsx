"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { toDateInputValue } from "@/lib/format";
import { createBodyWeightAction } from "@/lib/actions/bodyWeight";

export function WeightForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const date = String(data.get("date") ?? "");
    const weightKg = Number(data.get("weightKg"));

    startTransition(async () => {
      const result = await createBodyWeightAction({
        date: new Date(date),
        weightKg,
        note: String(data.get("note") ?? "") || undefined,
      });
      if (result.ok) {
        toast({ title: "Weight added", description: `${weightKg} kg on ${date}` });
        form.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={toDateInputValue()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weightKg">Weight (kg)</Label>
          <Input
            id="weightKg"
            name="weightKg"
            type="number"
            step="0.1"
            min="1"
            required
            placeholder="74.2"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" placeholder="e.g. morning, fasted" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        <Plus className="h-4 w-4" />
        {isPending ? "Saving…" : "Add weight"}
      </Button>
    </form>
  );
}
