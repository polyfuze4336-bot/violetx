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
import {
  createMeasurementTypeAction,
  deleteMeasurementTypeAction,
  updateMeasurementTypeAction,
} from "@/lib/actions/measurement";
import type { MeasurementTypeDTO } from "@/lib/dto";
import type { Unit } from "@/lib/schemas";

export function MeasurementTypeManager({
  types,
}: {
  types: MeasurementTypeDTO[];
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>("CM");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function toggleActive(t: MeasurementTypeDTO) {
    startTransition(async () => {
      const result = await updateMeasurementTypeAction({
        id: t.id,
        active: !t.active,
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

  function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMeasurementTypeAction({
        name,
        defaultUnit: unit,
      });
      if (result.ok) {
        toast({ title: "Measurement added" });
        setName("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Waist"
            required
          />
        </div>
        <div className="w-28 space-y-1">
          <label className="text-xs font-medium">Default unit</label>
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
        <Button type="submit" disabled={isPending || !name.trim()}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y rounded-md border">
        {types.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">
            No measurements yet.
          </li>
        )}
        {types.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between p-3 text-sm"
          >
            <span>
              <span className={t.active ? "" : "text-muted-foreground"}>
                {t.name}
              </span>
              <span className="ml-2 text-muted-foreground">
                {t.defaultUnit === "INCH" ? "inch" : "cm"}
              </span>
              {!t.active && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  (inactive)
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => toggleActive(t)}
              >
                {t.active ? "Deactivate" : "Activate"}
              </Button>
              <ConfirmDeleteButton
                onConfirm={deleteMeasurementTypeAction.bind(null, t.id)}
                title="Delete this measurement?"
                description="Measurements with readings cannot be deleted."
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
