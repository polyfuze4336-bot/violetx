"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface PickerExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
}

/** Searchable exercise chooser used to add or replace exercises. */
export function ExercisePicker({
  exercises,
  title = "Choose exercise",
  onPick,
  children,
}: {
  exercises: PickerExercise[];
  title?: string;
  onPick: (exerciseId: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const list = exercises
    .filter((e) => !q || [e.name, e.muscleGroup, e.equipment].some((v) => v?.toLowerCase().includes(q)))
    .slice(0, 60);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative px-4">
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search exercises"
            className="pl-9"
          />
        </div>
        <ul className="max-h-[55vh] divide-y overflow-y-auto px-2 pb-3 pt-2">
          {list.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              No exercises found. Add one in the Exercise library.
            </li>
          )}
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted"
                onClick={() => {
                  onPick(e.id);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[e.muscleGroup, e.equipment].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
