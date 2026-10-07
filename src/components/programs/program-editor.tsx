"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExercisePicker, type PickerExercise } from "@/components/workout/exercise-picker";
import { PROGRAM_TYPES } from "@/lib/program-schemas";
import type { ProgramInput } from "@/lib/program-schemas";

export interface EditableExercise {
  exerciseId?: string;
  exerciseName: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec: number | null;
  notes?: string;
}

export interface EditableTemplate {
  id?: string;
  name: string;
  weekday: number | null;
  notes?: string;
  exercises: EditableExercise[];
}

export interface EditableProgram {
  id?: string;
  name: string;
  programType: (typeof PROGRAM_TYPES)[number];
  description?: string;
  templates: EditableTemplate[];
}

const WEEKDAYS = ["Any day", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TYPE_LABEL: Record<(typeof PROGRAM_TYPES)[number], string> = {
  PPL: "Push / Pull / Legs",
  UPPER_LOWER: "Upper / Lower",
  FULL_BODY: "Full body",
  CUSTOM: "Custom",
};

const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ProgramEditor({
  initial,
  library,
  saveLabel,
  busy,
  error,
  banner,
  onSave,
  onCancel,
}: {
  initial: EditableProgram;
  library: PickerExercise[];
  saveLabel: string;
  busy: boolean;
  error: string | null;
  banner?: string;
  onSave: (program: ProgramInput) => void;
  onCancel: () => void;
}) {
  const [program, setProgram] = useState<EditableProgram>(initial);

  const patchTemplate = (i: number, fn: (t: EditableTemplate) => EditableTemplate) =>
    setProgram((p) => ({ ...p, templates: p.templates.map((t, idx) => (idx === i ? fn(t) : t)) }));

  return (
    <div className="space-y-4">
      {banner && <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">{banner}</p>}

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="space-y-1.5">
            <Label htmlFor="pg-name">Program name</Label>
            <Input id="pg-name" value={program.name} maxLength={120} onChange={(e) => setProgram({ ...program, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pg-type">Type</Label>
            <select
              id="pg-type"
              value={program.programType}
              onChange={(e) => setProgram({ ...program, programType: e.target.value as EditableProgram["programType"] })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PROGRAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Textarea value={program.description ?? ""} rows={2} maxLength={1024} placeholder="Description (optional)" onChange={(e) => setProgram({ ...program, description: e.target.value })} />
      </Card>

      {program.templates.map((t, ti) => (
        <Card key={ti} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={t.name} maxLength={120} aria-label="Day name" className="min-w-[10rem] flex-1 font-semibold" onChange={(e) => patchTemplate(ti, (x) => ({ ...x, name: e.target.value }))} />
            <select
              value={t.weekday ?? ""}
              aria-label="Preferred weekday"
              onChange={(e) => patchTemplate(ti, (x) => ({ ...x, weekday: e.target.value === "" ? null : Number(e.target.value) }))}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Any day</option>
              {WEEKDAYS.slice(1).map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="icon" aria-label="Move day up" onClick={() => setProgram((p) => ({ ...p, templates: move(p.templates, ti, ti - 1) }))}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Move day down" onClick={() => setProgram((p) => ({ ...p, templates: move(p.templates, ti, ti + 1) }))}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove day" onClick={() => setProgram((p) => ({ ...p, templates: p.templates.filter((_, i) => i !== ti) }))}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          <ul className="space-y-2">
            {t.exercises.map((e, ei) => (
              <li key={ei} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border p-2.5 sm:grid-cols-[1fr_4.5rem_4.5rem_4.5rem_4.5rem_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.exerciseName}</p>
                </div>
                <div className="flex items-center justify-end gap-0.5 sm:order-last">
                  <Button type="button" variant="ghost" size="icon" aria-label="Move exercise up" onClick={() => patchTemplate(ti, (x) => ({ ...x, exercises: move(x.exercises, ei, ei - 1) }))}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move exercise down" onClick={() => patchTemplate(ti, (x) => ({ ...x, exercises: move(x.exercises, ei, ei + 1) }))}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove exercise" onClick={() => patchTemplate(ti, (x) => ({ ...x, exercises: x.exercises.filter((_, i) => i !== ei) }))}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                {(
                  [
                    ["Sets", "targetSets", e.targetSets],
                    ["Min", "repMin", e.repMin],
                    ["Max", "repMax", e.repMax],
                    ["Rest s", "restSec", e.restSec ?? ""],
                  ] as const
                ).map(([label, key, value]) => (
                  <label key={key} className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {label}
                    <input
                      inputMode="numeric"
                      value={value}
                      onChange={(ev) =>
                        patchTemplate(ti, (x) => ({
                          ...x,
                          exercises: x.exercises.map((row, i) =>
                            i === ei ? { ...row, [key]: key === "restSec" && ev.target.value === "" ? null : num(ev.target.value, 1) } : row
                          ),
                        }))
                      }
                      className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-center text-sm font-semibold text-foreground"
                    />
                  </label>
                ))}
              </li>
            ))}
          </ul>

          <ExercisePicker
            exercises={library}
            title="Add exercise"
            onPick={(id) => {
              const found = library.find((l) => l.id === id);
              if (!found) return;
              patchTemplate(ti, (x) => ({
                ...x,
                exercises: [...x.exercises, { exerciseId: id, exerciseName: found.name, targetSets: 3, repMin: 8, repMax: 12, restSec: 90 }],
              }));
            }}
          >
            <Button type="button" variant="outline" size="sm">
              <Plus className="h-4 w-4" /> Add exercise
            </Button>
          </ExercisePicker>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={program.templates.length >= 7}
        onClick={() =>
          setProgram((p) => ({ ...p, templates: [...p.templates, { name: `Day ${p.templates.length + 1}`, weekday: null, exercises: [] }] }))
        }
      >
        <Plus className="h-4 w-4" /> Add workout day
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => onSave(program as ProgramInput)}>
          {saveLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
