"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, Copy, Pencil, Play, Plus, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  archiveProgramAction,
  confirmProposalAction,
  createProgramAction,
  duplicateProgramAction,
  proposeProgramAction,
  setActiveProgramAction,
  updateProgramAction,
} from "@/lib/actions/program";
import { startWorkoutAction } from "@/lib/actions/workout";
import { presetProgram } from "@/lib/programs";
import type { ProgramInput } from "@/lib/program-schemas";
import type { ProgramDTO } from "@/lib/services/program";
import type { PickerExercise } from "@/components/workout/exercise-picker";
import { ProgramEditor, type EditableProgram } from "@/components/programs/program-editor";

type Mode =
  | { kind: "list" }
  | { kind: "editor"; program: EditableProgram; editing: boolean }
  | { kind: "proposal"; program: EditableProgram; source: "ai" | "rules"; summary: string };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const toEditable = (p: ProgramDTO): EditableProgram => ({
  id: p.id,
  name: p.name,
  programType: p.programType as EditableProgram["programType"],
  description: p.description ?? undefined,
  templates: p.templates.map((t) => ({
    id: t.id,
    name: t.name,
    weekday: t.weekday,
    notes: t.notes ?? undefined,
    exercises: t.exercises.map((e) => ({ ...e, notes: e.notes ?? undefined })),
  })),
});

export function ProgramsClient({
  programs,
  library,
  isOwner,
}: {
  programs: ProgramDTO[];
  library: PickerExercise[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [days, setDays] = useState("");

  const done = (message: string) => {
    toast({ title: message });
    setMode({ kind: "list" });
    router.refresh();
  };

  async function save(payload: ProgramInput) {
    setBusy(true);
    setError(null);
    const res =
      mode.kind === "proposal"
        ? await confirmProposalAction(payload, mode.source)
        : mode.kind === "editor" && mode.editing
          ? await updateProgramAction(payload)
          : await createProgramAction(payload);
    setBusy(false);
    if (res.ok) done(mode.kind === "editor" && mode.editing ? "Program updated" : "Program saved");
    else setError(res.error);
  }

  async function ask() {
    setBusy(true);
    setError(null);
    const res = await proposeProgramAction(request, days ? Number(days) : undefined);
    setBusy(false);
    if (res.ok) {
      setMode({ kind: "proposal", program: res.data.program as EditableProgram, source: res.data.source, summary: res.data.summary });
      setAskOpen(false);
    } else toast({ title: "Could not create a proposal", description: res.error, variant: "destructive" });
  }

  async function simple(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    const res = await action();
    if (res.ok) {
      toast({ title: message });
      router.refresh();
    } else toast({ title: "Something went wrong", description: res.error, variant: "destructive" });
  }

  async function startTemplate(templateId: string) {
    const res = await startWorkoutAction({ date: localDate(), templateId });
    if (res.ok) router.push("/dashboard/workout");
    else toast({ title: "Could not start workout", description: res.error, variant: "destructive" });
  }

  if (mode.kind !== "list") {
    return (
      <ProgramEditor
        initial={mode.program}
        library={library}
        busy={busy}
        error={error}
        saveLabel={mode.kind === "proposal" ? "Confirm & save program" : "Save program"}
        banner={
          mode.kind === "proposal"
            ? `${mode.source === "ai" ? "Violet's proposal" : "Suggested program"}: ${mode.summary} Review and edit anything — nothing is saved until you confirm.`
            : undefined
        }
        onSave={save}
        onCancel={() => {
          setError(null);
          setMode({ kind: "list" });
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode({ kind: "editor", editing: false, program: { name: "", programType: "CUSTOM", templates: [{ name: "Day 1", weekday: null, exercises: [] }] } })}>
            <Plus className="h-4 w-4" /> New program
          </Button>
          <Button variant="outline" onClick={() => setAskOpen((v) => !v)}>
            <Sparkles className="h-4 w-4" /> Create with Violet
          </Button>
          {(["PPL", "UPPER_LOWER", "FULL_BODY"] as const).map((t) => (
            <Button key={t} variant="ghost" size="sm" onClick={() => setMode({ kind: "editor", editing: false, program: presetProgram(t) as EditableProgram })}>
              {t === "PPL" ? "PPL" : t === "UPPER_LOWER" ? "Upper/Lower" : "Full body"} preset
            </Button>
          ))}
        </div>
      )}

      {askOpen && (
        <Card className="space-y-3 p-4">
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="e.g. Create a four-day program focused on improving my bench and reducing body fat."
            aria-label="Describe the program you want"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days per week" className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Days: auto</option>
              {[2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {d} days / week
                </option>
              ))}
            </select>
            <Button onClick={ask} disabled={busy || request.trim().length < 3}>
              <Sparkles className="h-4 w-4" /> Generate proposal
            </Button>
            <p className="text-xs text-muted-foreground">You review and edit before anything is saved.</p>
          </div>
        </Card>
      )}

      {programs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No programs yet. {isOwner ? "Create one, pick a preset, or ask Violet." : ""}
        </Card>
      ) : (
        <div className="grid gap-4">
          {programs.map((p) => (
            <Card key={p.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    {p.isActive && <Badge>Active</Badge>}
                    {p.source === "AI" && <Badge variant="secondary">Violet</Badge>}
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                </div>
                {isOwner && (
                  <div className="flex flex-wrap gap-1.5">
                    {!p.isActive && (
                      <Button size="sm" variant="outline" onClick={() => simple(() => setActiveProgramAction(p.id), "Program activated")}>
                        <CheckCircle2 className="h-4 w-4" /> Set active
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setMode({ kind: "editor", editing: true, program: toEditable(p) })}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => simple(() => duplicateProgramAction(p.id), "Program duplicated")}>
                      <Copy className="h-4 w-4" /> Duplicate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => simple(() => archiveProgramAction(p.id, true), "Program archived")}>
                      <Archive className="h-4 w-4" /> Archive
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {p.templates.map((t) => (
                  <div key={t.id} className="rounded-xl border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{t.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {t.weekday !== null ? WEEKDAY[t.weekday] + " · " : ""}~{t.estimatedMinutes} min
                      </span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                      {t.exercises.map((e) => (
                        <li key={e.exerciseId} className="flex justify-between gap-2">
                          <span className="truncate">{e.exerciseName}</span>
                          <span className="shrink-0 tabular-nums">
                            {e.targetSets} × {e.repMin}–{e.repMax}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {isOwner && (
                      <Button size="sm" className="mt-3 w-full" variant="outline" onClick={() => startTemplate(t.id)}>
                        <Play className="h-4 w-4" /> Start
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
