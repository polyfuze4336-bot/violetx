"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toDateInputValue } from "@/lib/format";
import { parseWhatsAppMessage, type ParsedImport } from "@/lib/whatsapp-parser";
import type { ExportDay } from "@/lib/whatsapp-export";
import { ChatExportImport } from "@/components/import/chat-export-import";
import {
  ExerciseNameCheck,
  decisionRef,
  needsNameDecision,
  useExerciseSuggestions,
  type NameDecision,
} from "@/components/exercises/exercise-name-check";
import { resolveMeasurementUnit } from "@/lib/whatsapp-parser";
import {
  checkImportDuplicatesAction,
  commitImportAction,
} from "@/lib/actions/import";
import type { Resolution, Unit } from "@/lib/schemas";
import type { MeasurementTypeDTO } from "@/lib/dto";
import type { ImportSummary } from "@/lib/services/import";

interface EditableMeasurement {
  name: string;
  value: string;
  unit: Unit;
  assumed: boolean;
  duplicate: boolean;
  resolution: Resolution;
}
interface EditableSet {
  exercise: string;
  /** The user's answer to a proposed exercise-name correction. */
  decision: NameDecision | null;
  reps: string;
  weightKg: string;
  duplicate: boolean;
  resolution: Resolution;
}

const EXAMPLE = `Gym update 16 Aug

Weight - 74.2kg

waist - 38.5
hip - 38.1
chest - 37.9
thigh - 23.2
upper arm - 13.4inch

Hip abduction 9x50kg
Hip adduction 3 x 43kg`;

function ResolutionSelect({
  value,
  onChange,
}: {
  value: Resolution;
  onChange: (v: Resolution) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Resolution)}>
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SKIP">Skip</SelectItem>
        <SelectItem value="IMPORT">Import anyway</SelectItem>
        <SelectItem value="REPLACE">Replace existing</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ImportClient({
  types,
  defaultMeasurementUnit,
}: {
  types: MeasurementTypeDTO[];
  defaultMeasurementUnit: Unit;
}) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(false);
  const [date, setDate] = useState(toDateInputValue());
  const [weightKg, setWeightKg] = useState("");
  const [weightDuplicate, setWeightDuplicate] = useState(false);
  const [weightResolution, setWeightResolution] = useState<Resolution>("IMPORT");
  const [measurements, setMeasurements] = useState<EditableMeasurement[]>([]);
  const [sets, setSets] = useState<EditableSet[]>([]);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();

  function defaultUnitFor(name: string): Unit {
    const t = types.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return resolveMeasurementUnit(null, t?.defaultUnit, defaultMeasurementUnit);
  }

  async function runDuplicateCheck(
    dateStr: string,
    weightStr: string,
    meas: EditableMeasurement[],
    setList: EditableSet[]
  ) {
    setChecking(true);
    const validMeas = meas.filter((m) => m.name.trim() && m.value);
    const validSets = setList.filter(
      (s) => s.exercise.trim() && s.reps && s.weightKg
    );
    const result = await checkImportDuplicatesAction({
      date: new Date(dateStr),
      weightKg: weightStr ? Number(weightStr) : undefined,
      measurements: validMeas.map((m) => ({
        name: m.name.trim(),
        value: Number(m.value),
        unit: m.unit,
      })),
      sets: validSets.map((s) => ({
        exercise: s.exercise.trim(),
        exerciseRef: decisionRef(s.decision),
        reps: Number(s.reps),
        weightKg: Number(s.weightKg),
      })),
    });
    setChecking(false);
    if (!result.ok) return;

    setWeightDuplicate(result.data.weight);
    setWeightResolution(result.data.weight ? "SKIP" : "IMPORT");

    let mi = 0;
    setMeasurements((prev) =>
      prev.map((m) => {
        if (!(m.name.trim() && m.value)) return m;
        const dup = result.data.measurements[mi++] ?? false;
        return { ...m, duplicate: dup, resolution: dup ? "SKIP" : "IMPORT" };
      })
    );
    let si = 0;
    setSets((prev) =>
      prev.map((s) => {
        if (!(s.exercise.trim() && s.reps && s.weightKg)) return s;
        const dup = result.data.sets[si++] ?? false;
        return { ...s, duplicate: dup, resolution: dup ? "SKIP" : "IMPORT" };
      })
    );
  }

  const suggestionFor = useExerciseSuggestions(parsed ? sets.map((s) => s.exercise) : []);

  // Re-check duplicates after a confirmed correction: "Lat Pulldwon" may
  // already exist on this date under the canonical exercise.
  const decisionSig = sets.map((s) => decisionRef(s.decision) ?? "").join("|");
  const lastSig = useRef("");
  useEffect(() => {
    if (!parsed || decisionSig === lastSig.current) return;
    lastSig.current = decisionSig;
    if (!decisionSig.replace(/\|/g, "")) return;
    void (async () => {
      const valid = sets.filter((s) => s.exercise.trim() && s.reps && s.weightKg);
      const res = await checkImportDuplicatesAction({
        date: new Date(date),
        measurements: [],
        sets: valid.map((s) => ({
          exercise: s.exercise.trim(),
          exerciseRef: decisionRef(s.decision),
          reps: Number(s.reps),
          weightKg: Number(s.weightKg),
        })),
      });
      if (!res.ok) return;
      let si = 0;
      setSets((prev) =>
        prev.map((s) => {
          if (!(s.exercise.trim() && s.reps && s.weightKg)) return s;
          const dup = res.data.sets[si++] ?? false;
          return dup === s.duplicate ? s : { ...s, duplicate: dup, resolution: dup ? "SKIP" : "IMPORT" };
        })
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionSig, parsed]);

  function handleParse() {
    loadParsed(parseWhatsAppMessage(raw));
  }

  // Load a day from an uploaded chat export into the review editor.
  function handleReviewDay(day: ExportDay) {
    setRaw(day.sourceText);
    loadParsed({
      date: day.date,
      weightKg: day.weightKg,
      measurements: day.measurements,
      sets: day.sets,
      unparsedLines: [],
    });
    setTimeout(() => {
      document
        .getElementById("import-review")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function loadParsed(result: ParsedImport) {
    setError(null);
    setSummary(null);
    const nextDate = result.date ?? toDateInputValue();
    const nextWeight = result.weightKg != null ? String(result.weightKg) : "";
    const nextMeas: EditableMeasurement[] = result.measurements.map((m) => ({
      name: m.name,
      value: String(m.value),
      unit: m.unit ?? defaultUnitFor(m.name),
      assumed: m.unit === null,
      duplicate: false,
      resolution: "IMPORT",
    }));
    const nextSets: EditableSet[] = result.sets.map((s) => ({
      exercise: s.exercise,
      decision: null,
      reps: String(s.reps),
      weightKg: String(s.weightKg),
      duplicate: false,
      resolution: "IMPORT",
    }));
    setDate(nextDate);
    setWeightKg(nextWeight);
    setMeasurements(nextMeas);
    lastSig.current = "";
    setSets(nextSets);
    setUnparsed(result.unparsedLines);
    setParsed(true);
    void runDuplicateCheck(nextDate, nextWeight, nextMeas, nextSets);
  }

  function updateMeasurement(index: number, patch: Partial<EditableMeasurement>) {
    setMeasurements((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m))
    );
  }
  function updateSet(index: number, patch: Partial<EditableSet>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  const includeWeight =
    Boolean(weightKg) && weightResolution !== "SKIP";
  const validMeasurements = measurements.filter(
    (m) => m.name.trim() && m.value && m.resolution !== "SKIP"
  );
  const validSets = sets.filter(
    (s) => s.exercise.trim() && s.reps && s.weightKg && s.resolution !== "SKIP"
  );
  const pendingNames = validSets.filter((s) => needsNameDecision(suggestionFor(s.exercise), s.decision)).length;
  const recordCount =
    (includeWeight ? 1 : 0) + validMeasurements.length + validSets.length;
  const duplicateCount =
    (weightDuplicate ? 1 : 0) +
    measurements.filter((m) => m.duplicate).length +
    sets.filter((s) => s.duplicate).length;

  function handleCommit() {
    setError(null);
    startTransition(async () => {
      const result = await commitImportAction({
        rawText: raw,
        date: new Date(date),
        weightKg: weightKg ? Number(weightKg) : undefined,
        weightResolution,
        measurements: measurements
          .filter((m) => m.name.trim() && m.value)
          .map((m) => ({
            name: m.name.trim(),
            value: Number(m.value),
            unit: m.unit,
            resolution: m.resolution,
          })),
        sets: sets
          .filter((s) => s.exercise.trim() && s.reps && s.weightKg)
          .map((s) => ({
            exercise: s.exercise.trim(),
            exerciseRef: decisionRef(s.decision),
            reps: Number(s.reps),
            weightKg: Number(s.weightKg),
            resolution: s.resolution,
          })),
      });
      if (result.ok) {
        setSummary(result.data);
        setParsed(false);
        setRaw("");
        toast({ title: "Import saved", description: "Records were created." });
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {summary && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-start gap-3 p-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
            <div className="text-sm">
              <p className="font-medium">Import saved successfully.</p>
              <p className="text-muted-foreground">
                {summary.weightRecorded ? "Weight recorded · " : ""}
                {summary.measurementsCreated} measurement(s) ·{" "}
                {summary.setsCreated} set(s)
                {summary.replaced > 0 && ` · ${summary.replaced} replaced`}
                {summary.skipped > 0 && ` · ${summary.skipped} skipped`}
                {summary.newExercises.length > 0 &&
                  ` · new exercises: ${summary.newExercises.join(", ")}`}
              </p>
              <Link
                href="/dashboard/progress"
                className="mt-2 inline-block font-medium text-primary hover:underline"
              >
                See your training progress →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <ChatExportImport
        types={types}
        defaultMeasurementUnit={defaultMeasurementUnit}
        onReview={handleReviewDay}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paste your fitness update</CardTitle>
          <CardDescription>
            Paste a WhatsApp message containing measurements or workout results.
            Progress will organise it automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={10}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={EXAMPLE}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleParse} disabled={!raw.trim()}>
              <Sparkles className="h-4 w-4" />
              Analyse Update
            </Button>
            <Button
              variant="outline"
              onClick={() => setRaw(EXAMPLE)}
              type="button"
            >
              <ClipboardPaste className="h-4 w-4" />
              Use example
            </Button>
          </div>
        </CardContent>
      </Card>

      {parsed && (
        <Card id="import-review">
          <CardHeader>
            <CardTitle className="text-base">Review Import</CardTitle>
            <CardDescription>
              Check everything, edit any value, and remove anything you don&apos;t
              want. Nothing is saved until you confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="max-w-xs space-y-2">
              <Label htmlFor="import-date">Date of measurements/workout</Label>
              <Input
                id="import-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  void runDuplicateCheck(
                    e.target.value,
                    weightKg,
                    measurements,
                    sets
                  );
                }}
              />
              <p className="text-xs text-muted-foreground">
                {checking ? "Checking for duplicates…" : "Defaults to today; change if needed."}
              </p>
            </div>

            {duplicateCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>Possible duplicate{duplicateCount > 1 ? "s" : ""}</strong>{" "}
                  — {duplicateCount} record(s) already exist on this date. Choose
                  Skip, Import anyway, or Replace existing per item. Nothing is
                  overwritten automatically.
                </span>
              </div>
            )}

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Body measurements
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMeasurements((p) => [
                      ...p,
                      {
                        name: "",
                        value: "",
                        unit: defaultMeasurementUnit,
                        assumed: false,
                        duplicate: false,
                        resolution: "IMPORT",
                      },
                    ])
                  }
                >
                  Add row
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Weight</Label>
                  <Input value="Weight" disabled />
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Value</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="—"
                  />
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input value="kg" disabled />
                </div>
                {weightDuplicate ? (
                  <ResolutionSelect
                    value={weightResolution}
                    onChange={setWeightResolution}
                  />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setWeightKg("")}
                    aria-label="Remove weight"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
                {weightDuplicate && (
                  <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                    A weigh-in already exists on this date.
                  </p>
                )}
              </div>

              {measurements.map((m, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={m.name}
                      onChange={(e) =>
                        updateMeasurement(i, { name: e.target.value })
                      }
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Value</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={m.value}
                      onChange={(e) =>
                        updateMeasurement(i, { value: e.target.value })
                      }
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Select
                      value={m.unit}
                      onValueChange={(v) =>
                        updateMeasurement(i, { unit: v as Unit, assumed: false })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CM">cm</SelectItem>
                        <SelectItem value="INCH">inch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {m.duplicate ? (
                    <ResolutionSelect
                      value={m.resolution}
                      onChange={(v) => updateMeasurement(i, { resolution: v })}
                    />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setMeasurements((p) => p.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove measurement"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  {m.assumed && (
                    <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                      No unit was written — assumed{" "}
                      {m.unit === "INCH" ? "inches" : "cm"}. Please confirm.
                    </p>
                  )}
                  {m.duplicate && (
                    <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                      Possible duplicate — a reading already exists on this date.
                    </p>
                  )}
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Strength
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSets((p) => [
                      ...p,
                      {
                        exercise: "",
                        decision: null,
                        reps: "",
                        weightKg: "",
                        duplicate: false,
                        resolution: "IMPORT",
                      },
                    ])
                  }
                >
                  Add row
                </Button>
              </div>
              {sets.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No exercise sets detected.
                </p>
              )}
              {sets.map((s, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Exercise</Label>
                    <Input
                      value={s.exercise}
                      onChange={(e) => updateSet(i, { exercise: e.target.value, decision: null })}
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Reps</Label>
                    <Input
                      type="number"
                      value={s.reps}
                      onChange={(e) => updateSet(i, { reps: e.target.value })}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Weight (kg)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={s.weightKg}
                      onChange={(e) => updateSet(i, { weightKg: e.target.value })}
                    />
                  </div>
                  {s.duplicate ? (
                    <ResolutionSelect
                      value={s.resolution}
                      onChange={(v) => updateSet(i, { resolution: v })}
                    />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setSets((p) => p.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove set"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  <div className="w-full empty:hidden">
                    <ExerciseNameCheck
                      name={s.exercise}
                      suggestion={suggestionFor(s.exercise)}
                      decision={s.decision}
                      onDecide={(d) => updateSet(i, { decision: d })}
                    />
                  </div>
                  {s.duplicate && (
                    <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                      Possible duplicate — this set already exists on this date.
                    </p>
                  )}
                </div>
              ))}
            </section>

            {unparsed.length > 0 && (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <p className="mb-1 font-medium">Ignored lines:</p>
                <ul className="list-inside list-disc">
                  {unparsed.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {pendingNames > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {pendingNames} exercise name{pendingNames === 1 ? "" : "s"} need{pendingNames === 1 ? "s" : ""} your
                confirmation above (use the suggestion, choose another, or keep as a new exercise).
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCommit}
                disabled={isPending || recordCount === 0 || pendingNames > 0}
              >
                {isPending ? "Saving…" : `Save ${recordCount} Records`}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setParsed(false)}
                type="button"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
