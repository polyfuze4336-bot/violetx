"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { assessImportAction } from "@/lib/actions/import";
import {
  IMPORT_TYPES,
  IMPORT_TYPE_HINT,
  IMPORT_TYPE_LABEL,
  recommendImportType,
  summarizeDetection,
  type ClaimAssessment,
  type ImportType,
  type Recommendation,
} from "@/lib/import-interpretation";

/** A set as the review editor holds it (numbers may still be empty strings). */
export interface ReviewSet {
  exercise: string;
  exerciseRef?: string;
  reps: string;
  weightKg: string;
  prClaim?: boolean;
  /** The exercise name still waits for the user's decision. */
  unresolved: boolean;
}

const valid = (s: ReviewSet) => s.exercise.trim() && s.reps !== "" && s.weightKg !== "" && Number.isFinite(Number(s.reps)) && Number.isFinite(Number(s.weightKg));

/**
 * Import type: starts at the recommendation and follows it until the user picks
 * one. The user's choice always wins.
 */
export function useImportType(rawText: string, sets: ReviewSet[]) {
  const sig = sets.filter(valid).map((s) => `${s.exercise.trim().toLowerCase()}|${s.prClaim ? 1 : 0}`).join(";");
  const rec: Recommendation = useMemo(
    () => recommendImportType({ rawText, sets: sets.filter(valid).map((s) => ({ exercise: s.exercise, prClaim: s.prClaim })) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawText, sig]
  );
  const [chosen, setChosen] = useState<ImportType | null>(null);
  return { type: chosen ?? rec.type, setType: setChosen, reset: () => setChosen(null), recommendation: rec };
}

/** Checks the claimed sets against recorded history (server-side PR engine). */
function useAssessments(date: string, sets: ReviewSet[]): (ClaimAssessment | null)[] {
  const items = sets.map((s) => (valid(s) ? s : null));
  const sig = JSON.stringify([date, items.map((s) => s && [s.exercise.trim(), s.exerciseRef ?? "", s.reps, s.weightKg, s.prClaim ? 1 : 0, s.unresolved ? 1 : 0])]);
  const [result, setResult] = useState<{ sig: string; items: (ClaimAssessment | null)[] } | null>(null);
  const latest = useRef(sig);
  latest.current = sig;

  useEffect(() => {
    const present = items.map((s, i) => ({ s, i })).filter((x): x is { s: ReviewSet; i: number } => x.s !== null);
    if (present.length === 0 || !date) return;
    const handle = setTimeout(() => {
      void (async () => {
        const res = await assessImportAction({
          date: new Date(date),
          sets: present.map(({ s }) => ({
            exercise: s.exercise.trim(),
            exerciseRef: s.exerciseRef,
            reps: Number(s.reps),
            weightKg: Number(s.weightKg),
            prClaim: s.prClaim,
            unresolved: s.unresolved,
          })),
        });
        if (!res.ok || latest.current !== sig) return;
        const aligned: (ClaimAssessment | null)[] = items.map(() => null);
        present.forEach(({ i }, k) => (aligned[i] = res.data[k] ?? null));
        setResult({ sig, items: aligned });
      })();
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return result && result.sig === sig ? result.items : items.map(() => null);
}

const BADGE: Record<ClaimAssessment["status"], { text: string; tone: string }> = {
  CONFIRMED_PR: { text: "Confirmed PR", tone: "bg-magenta/10 text-magenta" },
  NOT_A_PR: { text: "Progress entry", tone: "bg-muted text-muted-foreground" },
  FIRST_RECORD: { text: "First record", tone: "bg-primary/10 text-primary" },
  SUPPORTING: { text: "Same progress", tone: "bg-muted text-muted-foreground" },
  UNRESOLVED: { text: "Confirm name", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
};

const kgText = (n: number, assisted: boolean) => `${Math.round(n * 100) / 100} kg${assisted ? " assistance" : ""}`;

/**
 * "What is this message?" review: Violet's recommended import type (changeable),
 * the explanation, and a deterministic PR check per exercise. Nothing here
 * writes data; saving happens only when the user confirms the import.
 */
export function ImportTypeReview({
  date,
  sets,
  type,
  onChange,
  recommendation,
  compact = false,
}: {
  date: string;
  sets: ReviewSet[];
  type: ImportType;
  onChange: (t: ImportType) => void;
  recommendation: Recommendation;
  /** Narrow containers: stack the three options. */
  compact?: boolean;
}) {
  const assessments = useAssessments(date, sets);
  const detected = summarizeDetection(recommendation);
  const rows = sets
    .map((s, i) => ({ s, a: assessments[i] ?? null }))
    .filter((r): r is { s: ReviewSet; a: ClaimAssessment | null } => Boolean(valid(r.s)));
  // A full workout can be long: only call out PRs and claims there.
  const shown = (type === "FULL" ? rows.filter((r) => r.a && (r.a.status === "CONFIRMED_PR" || r.a.claimedPr)) : rows).slice(0, 12);

  if (rows.length === 0) return null;

  return (
    <section aria-label="Import type" className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WhatsApp import</p>
          <p className="text-sm font-medium">Violet detected: {detected}</p>
          <p className="text-sm text-muted-foreground">
            Likely: <strong className="text-foreground">{IMPORT_TYPE_LABEL[recommendation.type]}</strong>. {recommendation.reason}
          </p>
        </div>
      </div>

      <div role="radiogroup" aria-label="Import type" className={cn("grid gap-2", !compact && "sm:grid-cols-3")}>
        {IMPORT_TYPES.map((t) => {
          const on = t === type;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(t)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                on ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn("grid h-4 w-4 place-items-center rounded-full border", on ? "border-primary" : "border-muted-foreground/40")}>
                  {on && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                {IMPORT_TYPE_LABEL[t]}
                {t === recommendation.type && <span className="text-[10px] font-medium text-primary">suggested</span>}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{IMPORT_TYPE_HINT[t]}</span>
            </button>
          );
        })}
      </div>

      {type !== "FULL" && (
        <p className="text-xs text-muted-foreground">
          Only these exercises are recorded. VioletX does not treat missing exercises as skipped, and this will not change workout counts or adherence.
        </p>
      )}

      <ul className="space-y-2">
        {shown.map(({ s, a }, i) => {
          const assisted = a?.assisted ?? false;
          return (
            <li key={i} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{s.exercise.trim()}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {kgText(Number(s.weightKg), assisted)} × {Number(s.reps)}
                  </p>
                </div>
                {a ? (
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", BADGE[a.status].tone)}>
                    {a.status === "CONFIRMED_PR" && <Trophy className="h-3 w-3" />}
                    {a.status === "CONFIRMED_PR" && a.label ? a.label.toUpperCase() : BADGE[a.status].text}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Checking…</span>
                )}
              </div>
              {a && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {a.status === "CONFIRMED_PR" ? (
                    <>
                      {a.previous && (
                        <p>
                          Previous best: {kgText(a.previous.weightKg, assisted)} × {a.previous.reps}
                        </p>
                      )}
                      <p className="font-medium text-foreground">{a.detail}</p>
                    </>
                  ) : (
                    <p>{a.message}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length < rows.length && type !== "FULL" && (
        <p className="text-xs text-muted-foreground">Showing {shown.length} of {rows.length} sets.</p>
      )}
    </section>
  );
}
