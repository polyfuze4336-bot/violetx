"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Clock,
  History,
  Minus,
  NotebookPen,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
  Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  addWorkoutExerciseAction,
  deleteSetAction,
  discardWorkoutAction,
  finishWorkoutAction,
  logSetAction,
  removeWorkoutExerciseAction,
  replaceWorkoutExerciseAction,
  setWorkoutExerciseNotesAction,
  skipWorkoutExerciseAction,
} from "@/lib/actions/workout";
import { formatDate } from "@/lib/format";
import { epley } from "@/lib/training-analytics";
import { ExercisePicker, type PickerExercise } from "@/components/workout/exercise-picker";
import { GymPicker } from "@/components/workout/gym-picker";
import type { GymOptionDTO } from "@/lib/services/gym";
import { PrCelebration, type PrCelebrationData } from "@/components/workout/pr-celebration";
import { RestTimerBar, useRestTimer, type RestTimerApi } from "@/components/workout/rest-timer";
import type {
  ActiveExerciseDTO,
  ActiveWorkoutDTO,
  WorkoutSummaryDTO,
} from "@/lib/services/workout";

function Stepper({
  label,
  value,
  step,
  min = 0,
  decimals = 0,
  onChange,
}: {
  label: string;
  value: string;
  step: number;
  min?: number;
  decimals?: number;
  onChange: (v: string) => void;
}) {
  const bump = (dir: 1 | -1) => {
    const n = Number(value) || 0;
    const next = Math.max(min, Math.round((n + dir * step) * 100) / 100);
    onChange(String(decimals ? next : Math.round(next)));
  };
  return (
    <div className="flex-1">
      <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => bump(-1)}
          aria-label={`Decrease ${label}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-background active:scale-95"
        >
          <Minus className="h-5 w-5" />
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
          inputMode="decimal"
          aria-label={label}
          className="h-12 min-w-0 flex-1 rounded-xl border bg-background text-center text-2xl font-bold tabular-nums outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => bump(1)}
          aria-label={`Increase ${label}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-background active:scale-95"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function ExerciseCard({
  ex,
  index,
  open,
  onToggle,
  library,
  timer,
  onChange,
  onPr,
}: {
  ex: ActiveExerciseDTO;
  index: number;
  open: boolean;
  onToggle: () => void;
  library: PickerExercise[];
  timer: RestTimerApi;
  onChange: (updater: (w: ActiveWorkoutDTO) => ActiveWorkoutDTO) => void;
  onPr: (d: PrCelebrationData) => void;
}) {
  const { toast } = useToast();
  const lastLogged = ex.sets[ex.sets.length - 1];
  const nth = ex.sets.length;
  const prevSet = ex.previous?.sets[nth] ?? ex.previous?.sets[ex.previous.sets.length - 1];

  const [weight, setWeight] = useState(() =>
    String(lastLogged?.weightKg ?? ex.suggestion.weightKg ?? prevSet?.weightKg ?? "")
  );
  const [reps, setReps] = useState(() =>
    String(lastLogged?.reps ?? prevSet?.reps ?? ex.suggestion.repMin)
  );
  const [rpe, setRpe] = useState<number | null>(null);
  const [warmup, setWarmup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrev, setShowPrev] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(ex.notes ?? "");

  const patch = useCallback(
    (fn: (e: ActiveExerciseDTO) => ActiveExerciseDTO) =>
      onChange((w) => ({ ...w, exercises: w.exercises.map((e) => (e.id === ex.id ? fn(e) : e)) })),
    [onChange, ex.id]
  );

  async function logSet() {
    const w = Number(weight);
    const r = Number(reps);
    if (!(r >= 1)) {
      toast({ title: "Enter reps", variant: "destructive" });
      return;
    }
    if (!(w >= 0) || weight === "") {
      toast({ title: "Enter a weight (0 for bodyweight)", variant: "destructive" });
      return;
    }
    setBusy(true);
    const res = await logSetAction({
      workoutExerciseId: ex.id,
      weightKg: w,
      reps: r,
      rpe: rpe ?? undefined,
      setType: warmup ? "WARMUP" : "WORK",
    });
    setBusy(false);
    if (!res.ok) {
      toast({ title: "Could not log set", description: res.error, variant: "destructive" });
      return;
    }
    patch((e) => ({ ...e, sets: [...e.sets, res.data.set] }));
    setRpe(null);
    if (timer.pref.auto) timer.start(warmup ? Math.min(60, timer.pref.seconds) : timer.pref.seconds);
    if (res.data.prs.length > 0) {
      onPr({
        exerciseName: ex.name,
        weightKg: w,
        reps: r,
        achievements: res.data.prs,
        estimatedOneRepMaxKg: Math.round(epley(w, r) * 10) / 10,
      });
    }
  }

  async function removeSet(id: string) {
    const res = await deleteSetAction(id);
    if (res.ok) patch((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== id) }));
    else toast({ title: "Could not delete set", description: res.error, variant: "destructive" });
  }

  async function toggleSkip() {
    const res = await skipWorkoutExerciseAction(ex.id, !ex.skipped);
    if (res.ok) patch((e) => ({ ...e, skipped: !e.skipped }));
    else toast({ title: "Could not update", description: res.error, variant: "destructive" });
  }

  async function replaceWith(newId: string) {
    const res = await replaceWorkoutExerciseAction(ex.id, newId);
    if (res.ok) onChange(() => res.data);
    else toast({ title: "Could not replace", description: res.error, variant: "destructive" });
  }

  async function remove() {
    const res = await removeWorkoutExerciseAction(ex.id);
    if (res.ok) onChange((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== ex.id) }));
    else toast({ title: "Could not remove", description: res.error, variant: "destructive" });
  }

  async function saveNotes() {
    const res = await setWorkoutExerciseNotesAction({ workoutExerciseId: ex.id, notes });
    if (res.ok) {
      patch((e) => ({ ...e, notes: notes || null }));
      toast({ title: "Note saved" });
    } else toast({ title: "Could not save note", description: res.error, variant: "destructive" });
  }

  const target =
    ex.suggestion.weightKg !== null
      ? `${ex.suggestion.weightKg} kg × ${ex.suggestion.repMin}–${ex.suggestion.repMax}`
      : `Baseline · ${ex.suggestion.repMin}–${ex.suggestion.repMax} reps`;
  const workCount = ex.sets.filter((s) => s.setType !== "WARMUP").length;

  return (
    <Card className={cn("overflow-hidden", ex.skipped && "opacity-60")}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open}>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
            workCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {workCount > 0 ? <Check className="h-4 w-4" /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{ex.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {ex.skipped ? "Skipped" : `${ex.muscleGroup} · target ${target}`}
          </span>
        </span>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{workCount} sets</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          {!ex.skipped && (
            <>
              <div className="rounded-xl bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Today&apos;s target</p>
                    <p className="text-lg font-bold tabular-nums">{target}</p>
                  </div>
                  <button type="button" onClick={() => setShowWhy((v) => !v)} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                    {showWhy ? "Hide" : "Why?"}
                  </button>
                </div>
                {showWhy && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ex.suggestion.rationale}{" "}
                    <span className="italic">A suggestion from your logged data — not a guarantee. Adjust to how you feel.</span>
                  </p>
                )}
              </div>

              {ex.previous && (
                <div>
                  <button type="button" onClick={() => setShowPrev((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <History className="h-3.5 w-3.5" /> Last time · {formatDate(ex.previous.date)}
                  </button>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(showPrev ? ex.previous.sets : ex.previous.sets.slice(0, 3)).map((s, i) => (
                      <span key={i} className="rounded-lg bg-muted px-2.5 py-1 text-sm font-medium tabular-nums">
                        {s.weightKg} kg × {s.reps}
                      </span>
                    ))}
                    {!showPrev && ex.previous.sets.length > 3 && (
                      <span className="px-1 py-1 text-xs text-muted-foreground">+{ex.previous.sets.length - 3}</span>
                    )}
                  </div>
                </div>
              )}

              {ex.sets.length > 0 && (
                <ol className="space-y-1.5">
                  {ex.sets.map((s, i) => (
                    <li key={s.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                      <span className="flex items-center gap-3 text-sm">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.setType === "WARMUP" ? "Warm-up" : `Set ${i + 1 - ex.sets.slice(0, i).filter((x) => x.setType === "WARMUP").length}`}
                        </span>
                        <span className="text-lg font-bold tabular-nums">
                          {s.weightKg} kg × {s.reps}
                        </span>
                        {s.rpe !== null && <span className="text-xs text-muted-foreground">RPE {s.rpe}</span>}
                      </span>
                      <button type="button" onClick={() => removeSet(s.id)} aria-label="Delete set" className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                <div className="flex gap-3">
                  <Stepper label="Weight kg" value={weight} step={2.5} decimals={1} onChange={setWeight} />
                  <Stepper label="Reps" value={reps} step={1} min={1} onChange={setReps} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1" role="group" aria-label="RPE">
                    <span className="mr-1 text-[11px] font-semibold uppercase text-muted-foreground">RPE</span>
                    {[6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRpe(rpe === n ? null : n)}
                        className={cn(
                          "h-9 w-9 rounded-lg border text-sm font-semibold",
                          rpe === n ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" className="accent-primary" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} />
                    Warm-up
                  </label>
                </div>
                <Button onClick={logSet} disabled={busy} className="h-14 w-full text-base font-semibold">
                  <Check className="h-5 w-5" /> Log set {workCount + (warmup ? 0 : 1)}
                </Button>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/exercises/${ex.exerciseId}`}>
                <History className="h-4 w-4" /> History
              </Link>
            </Button>
            {ex.sets.length === 0 && (
              <ExercisePicker exercises={library} title="Replace exercise" onPick={replaceWith}>
                <Button size="sm" variant="outline">
                  <Repeat className="h-4 w-4" /> Replace
                </Button>
              </ExercisePicker>
            )}
            <Button size="sm" variant="outline" onClick={toggleSkip}>
              <SkipForward className="h-4 w-4" /> {ex.skipped ? "Unskip" : "Skip"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNotes((v) => !v)}>
              <NotebookPen className="h-4 w-4" /> Notes
            </Button>
            {ex.sets.length === 0 && (
              <Button size="sm" variant="ghost" onClick={remove} className="text-muted-foreground">
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>

          {showNotes && (
            <div className="space-y-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1024} placeholder="Cues, pain, machine settings…" />
              <Button size="sm" onClick={saveNotes}>
                Save note
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Elapsed({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
      <Clock className="h-4 w-4 text-primary" />
      {h > 0 ? `${h}:` : ""}
      {String(m).padStart(h > 0 ? 2 : 1, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function Chips({ value, onChange, options, label }: { value: number | null; onChange: (n: number | null) => void; options: number[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={cn("h-10 w-10 rounded-lg border text-sm font-semibold", value === n ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function ActiveWorkout({
  initial,
  library,
}: {
  initial: ActiveWorkoutDTO;
  library: PickerExercise[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const timer = useRestTimer();
  const [workout, setWorkout] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(initial.exercises.find((e) => e.sets.length === 0 && !e.skipped)?.id ?? initial.exercises[0]?.id ?? null);
  const [pr, setPr] = useState<PrCelebrationData | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [finishGym, setFinishGym] = useState<GymOptionDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<WorkoutSummaryDTO | null>(null);

  const totalSets = workout.exercises.reduce((a, e) => a + e.sets.filter((s) => s.setType !== "WARMUP").length, 0);

  async function addExercise(id: string) {
    const res = await addWorkoutExerciseAction(id);
    if (res.ok) {
      setWorkout(res.data);
      const added = res.data.exercises[res.data.exercises.length - 1];
      setOpenId(added?.id ?? null);
    } else toast({ title: "Could not add exercise", description: res.error, variant: "destructive" });
  }

  async function finish() {
    setBusy(true);
    const res = await finishWorkoutAction({
      sessionRpe: rpe ?? undefined,
      difficulty: difficulty ?? undefined,
      note: note || undefined,
      gymBranchId: finishGym?.id,
    });
    setBusy(false);
    if (res.ok) {
      timer.skip();
      setFinishOpen(false);
      setSummary(res.data);
    } else toast({ title: "Could not finish workout", description: res.error, variant: "destructive" });
  }

  async function discard() {
    setBusy(true);
    const res = await discardWorkoutAction();
    setBusy(false);
    if (res.ok) {
      timer.skip();
      router.refresh();
    } else toast({ title: "Could not discard", description: res.error, variant: "destructive" });
  }

  if (summary) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="space-y-4 p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold">{summary.discarded ? "Workout discarded" : "Workout complete"}</h2>
          {!summary.discarded && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-2xl font-bold tabular-nums">{summary.durationMin ?? "—"}</p>
                <p className="text-[11px] uppercase text-muted-foreground">min</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-2xl font-bold tabular-nums">{summary.totalSets}</p>
                <p className="text-[11px] uppercase text-muted-foreground">sets</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-2xl font-bold tabular-nums">{summary.totalVolumeKg.toLocaleString()}</p>
                <p className="text-[11px] uppercase text-muted-foreground">kg volume</p>
              </div>
            </div>
          )}
          {summary.prs.length > 0 && (
            <div className="space-y-2 text-left">
              {summary.prs.map((p) => (
                <div key={p.exerciseName} className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <Trophy className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{p.exerciseName}</p>
                    <p className="text-xs text-muted-foreground">{p.achievements.map((a) => a.label).join(" · ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/dashboard/progress">See progress</Link>
            </Button>
            <Button variant="outline" onClick={() => router.refresh()}>
              Done
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-48">
      <div className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="min-w-0">
          <p className="truncate font-semibold">{workout.name ?? "Workout"}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Elapsed startedAt={workout.startedAt} />
            <span>{totalSets} sets</span>
            {workout.gym && <span className="truncate">{workout.gym.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setDiscardOpen(true)} aria-label="Discard workout">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button onClick={() => setFinishOpen(true)}>Finish</Button>
        </div>
      </div>

      {workout.exercises.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Add your first exercise to begin.</Card>
      )}

      {workout.exercises.map((ex, i) => (
        <ExerciseCard
          key={ex.id + ":" + ex.exerciseId}
          ex={ex}
          index={i}
          open={openId === ex.id}
          onToggle={() => setOpenId(openId === ex.id ? null : ex.id)}
          library={library}
          timer={timer}
          onChange={(fn) => setWorkout(fn)}
          onPr={setPr}
        />
      ))}

      <ExercisePicker exercises={library} title="Add exercise" onPick={addExercise}>
        <Button variant="outline" className="h-12 w-full">
          <Plus className="h-4 w-4" /> Add exercise
        </Button>
      </ExercisePicker>

      <RestTimerBar timer={timer} />
      <PrCelebration data={pr} onClose={() => setPr(null)} />

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Session effort (RPE 1–10)</p>
              <Chips value={rpe} onChange={setRpe} options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} label="Session RPE" />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">How did it feel? (1 easy – 5 very hard)</p>
              <Chips value={difficulty} onChange={setDifficulty} options={[1, 2, 3, 4, 5]} label="Perceived difficulty" />
            </div>
            {!workout.gym && <GymPicker value={finishGym} onChange={setFinishGym} />}
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1024} placeholder="Notes (optional)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOpen(false)}>
              Keep training
            </Button>
            <Button onClick={finish} disabled={busy}>
              Finish workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this workout?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Everything logged in this workout will be deleted. This can&apos;t be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={discard} disabled={busy}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
