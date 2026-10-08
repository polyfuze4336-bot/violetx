"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Library, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  createExerciseAction,
  seedStarterLibraryAction,
} from "@/lib/actions/exercise";
import { formatDate } from "@/lib/format";
import { MUSCLE_GROUPS } from "@/lib/training-analytics";
import type { ExerciseDTO } from "@/lib/dto";

export interface ExerciseStats {
  /** Assisted: maxWeightKg is the lowest assistance and there is no 1RM estimate. */
  assisted?: boolean;
  maxWeightKg: number;
  estimatedOneRepMaxKg: number;
  totalSets: number;
  lastPerformed: string;
}

const PATTERNS = ["Push", "Pull", "Squat", "Hinge", "Lunge", "Carry", "Core", "Isolation"];

const categoryFor = (g: string) =>
  g === "Biceps" || g === "Triceps"
    ? "Arms"
    : g === "Quads" || g === "Hamstrings" || g === "Calves"
      ? "Legs"
      : g === "Glutes & Hips"
        ? "Glutes"
        : g === "Other"
          ? undefined
          : g;

function AddExerciseDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    const muscle = get("muscle") ?? "Other";
    startTransition(async () => {
      const result = await createExerciseAction({
        name: String(f.get("name") ?? ""),
        muscleGroup: muscle,
        category: categoryFor(muscle),
        equipment: get("equipment"),
        movementPattern: get("pattern"),
        secondaryMuscles: get("secondary"),
        aliases: get("aliases"),
        instructions: get("instructions"),
        tips: get("tips"),
        active: true,
      });
      if (result.ok) {
        toast({ title: "Exercise added" });
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Custom exercise
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New exercise</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Name</Label>
            <Input id="ex-name" name="name" required maxLength={150} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-muscle">Primary muscle</Label>
              <select id="ex-muscle" name="muscle" defaultValue="Chest" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {MUSCLE_GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-pattern">Movement</Label>
              <select id="ex-pattern" name="pattern" defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                {PATTERNS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-equip">Equipment</Label>
              <Input id="ex-equip" name="equipment" maxLength={60} placeholder="Barbell, Cable…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-secondary">Secondary muscles</Label>
              <Input id="ex-secondary" name="secondary" maxLength={200} placeholder="Triceps, Shoulders" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-aliases">Aliases</Label>
            <Input id="ex-aliases" name="aliases" maxLength={400} placeholder="Comma separated" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-instr">Instructions</Label>
            <Textarea id="ex-instr" name="instructions" rows={3} maxLength={4000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-tips">Tip</Label>
            <Input id="ex-tips" name="tips" maxLength={1000} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              Save exercise
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExerciseLibrary({
  exercises,
  stats,
  isOwner,
}: {
  exercises: ExerciseDTO[];
  stats: Record<string, ExerciseStats>;
  isOwner: boolean;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string>("All");
  const [showInactive, setShowInactive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const muscles = useMemo(
    () => ["All", ...Array.from(new Set(exercises.map((e) => e.muscleGroup).filter((m): m is string => Boolean(m)))).sort()],
    [exercises]
  );

  const visible = exercises.filter((e) => {
    if (!showInactive && !e.active) return false;
    if (muscle !== "All" && e.muscleGroup !== muscle) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [e.name, e.aliases, e.equipment, e.muscleGroup, e.secondaryMuscles]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q));
  });

  function loadStarter() {
    startTransition(async () => {
      const result = await seedStarterLibraryAction();
      if (result.ok) {
        toast({
          title: "Starter library loaded",
          description: `${result.data.created} added, ${result.data.skipped} already in your library.`,
        });
        router.refresh();
      } else {
        toast({ title: "Could not load library", description: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            aria-label="Search exercises"
            className="pl-9"
          />
        </div>
        {isOwner && (
          <>
            <Button variant="outline" onClick={loadStarter} disabled={isPending}>
              <Library className="h-4 w-4" /> Starter library
            </Button>
            <AddExerciseDialog />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {muscles.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMuscle(m)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              muscle === m ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {m}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Inactive
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No exercises match.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((ex) => {
            const s = stats[ex.id];
            return (
              <Link key={ex.id} href={`/dashboard/exercises/${ex.id}`} className="group">
                <Card className="h-full p-4 transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{ex.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {[ex.muscleGroup, ex.equipment].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Dumbbell className="h-[18px] w-[18px]" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ex.movementPattern && <Badge variant="secondary">{ex.movementPattern}</Badge>}
                    {ex.isCustom && <Badge variant="outline">Custom</Badge>}
                    {!ex.active && <Badge variant="outline">Inactive</Badge>}
                  </div>
                  {s ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold tabular-nums">{s.maxWeightKg}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">{s.assisted ? "Least assist kg" : "Best kg"}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold tabular-nums text-magenta">{s.assisted ? "—" : s.estimatedOneRepMaxKg}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">Est. 1RM</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{formatDate(s.lastPerformed)}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">Last</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">Not performed yet</p>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
