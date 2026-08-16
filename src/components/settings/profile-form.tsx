"use client";

import { useState, useTransition } from "react";

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
import { updateAthleteProfileAction } from "@/lib/actions/note";
import type { AthleteProfileDTO } from "@/lib/dto";
import type { Unit } from "@/lib/schemas";

export function ProfileForm({ profile }: { profile: AthleteProfileDTO }) {
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>(profile.defaultMeasurementUnit);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const heightRaw = String(data.get("heightCm") ?? "");
    const birthRaw = String(data.get("birthDate") ?? "");

    startTransition(async () => {
      const result = await updateAthleteProfileAction({
        displayName: String(data.get("displayName") ?? "") || undefined,
        heightCm: heightRaw ? Number(heightRaw) : undefined,
        birthDate: birthRaw ? new Date(birthRaw) : undefined,
        sex: String(data.get("sex") ?? "") || undefined,
        defaultMeasurementUnit: unit,
      });
      if (result.ok) {
        toast({ title: "Profile updated" });
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={profile.displayName}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="heightCm">Height (cm)</Label>
          <Input
            id="heightCm"
            name="heightCm"
            type="number"
            step="0.1"
            defaultValue={profile.heightCm ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthDate">Date of birth</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={
              profile.birthDate
                ? toDateInputValue(profile.birthDate)
                : ""
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sex">Sex (optional)</Label>
          <Input id="sex" name="sex" defaultValue={profile.sex ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>Default measurement unit</Label>
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
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
