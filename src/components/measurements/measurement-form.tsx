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
import { createMeasurementEntryAction } from "@/lib/actions/measurement";
import type { MeasurementTypeDTO } from "@/lib/dto";
import type { Unit } from "@/lib/schemas";

export function MeasurementForm({ types }: { types: MeasurementTypeDTO[] }) {
  const activeTypes = types.filter((t) => t.active);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string>(activeTypes[0]?.id ?? "");
  const [unit, setUnit] = useState<Unit>(activeTypes[0]?.defaultUnit ?? "CM");
  const [date, setDate] = useState(toDateInputValue());
  const [value, setValue] = useState("");
  const { toast } = useToast();

  function handleTypeChange(id: string) {
    setTypeId(id);
    const t = activeTypes.find((x) => x.id === id);
    if (t) setUnit(t.defaultUnit);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMeasurementEntryAction({
        typeId,
        date: new Date(date),
        value: Number(value),
        unit,
      });
      if (result.ok) {
        toast({ title: "Measurement added" });
        setValue("");
      } else {
        setError(result.error);
      }
    });
  }

  if (activeTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a measurement type in Settings first.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Measurement</Label>
          <Select value={typeId} onValueChange={handleTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {activeTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
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
          <Label htmlFor="value">Value</Label>
          <Input
            id="value"
            type="number"
            step="0.1"
            min="0"
            required
            placeholder="38.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CM">cm</SelectItem>
              <SelectItem value="INCH">inch</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        <Plus className="h-4 w-4" />
        {isPending ? "Saving…" : "Add measurement"}
      </Button>
    </form>
  );
}
