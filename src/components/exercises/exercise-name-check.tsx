"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exerciseChoicesAction, suggestExercisesAction } from "@/lib/actions/exercise";
import { normalizeExerciseName } from "@/lib/exercise-matching";
import type { ExerciseChoiceDTO, ExerciseSuggestionDTO } from "@/lib/services/exerciseMatch";

/** What the user decided for a typed/imported exercise name. */
export type NameDecision = { kind: "ref"; ref: string; name: string } | { kind: "custom" };

/** The confirmed ref to send with a set (undefined = exact match or custom). */
export const decisionRef = (d: NameDecision | null | undefined) => (d?.kind === "ref" ? d.ref : undefined);

/** A correction was proposed and the user has not answered yet. */
export function needsNameDecision(
  s: ExerciseSuggestionDTO | undefined,
  d: NameDecision | null | undefined
): boolean {
  return !d && (s?.status === "HIGH" || s?.status === "AMBIGUOUS");
}

/**
 * Looks up exercise-name proposals for the given names (debounced, cached per
 * normalised name). Read-only: the server never changes anything here.
 */
export function useExerciseSuggestions(names: string[]) {
  const [byKey, setByKey] = useState<Record<string, ExerciseSuggestionDTO>>({});
  const asked = useRef(new Set<string>());
  const signature = names.map(normalizeExerciseName).filter(Boolean).sort().join("|");

  useEffect(() => {
    const todo = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).filter(
      (n) => !asked.current.has(normalizeExerciseName(n))
    );
    if (todo.length === 0) return;
    const timer = setTimeout(async () => {
      todo.forEach((n) => asked.current.add(normalizeExerciseName(n)));
      const res = await suggestExercisesAction(todo);
      if (!res.ok) {
        todo.forEach((n) => asked.current.delete(normalizeExerciseName(n)));
        return;
      }
      setByKey((prev) => {
        const next = { ...prev };
        for (const s of res.data) next[normalizeExerciseName(s.input)] = s;
        return next;
      });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (name: string): ExerciseSuggestionDTO | undefined => byKey[normalizeExerciseName(name)];
}

export function ExerciseNameCheck({
  name,
  suggestion,
  decision,
  onDecide,
}: {
  name: string;
  suggestion: ExerciseSuggestionDTO | undefined;
  decision: NameDecision | null;
  onDecide: (d: NameDecision | null) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const [choices, setChoices] = useState<ExerciseChoiceDTO[] | null>(null);

  async function openChoices() {
    setChoosing(true);
    if (!choices) {
      const res = await exerciseChoicesAction();
      if (res.ok) setChoices(res.data);
    }
  }

  if (!name.trim() || !suggestion) return null;

  if (decision?.kind === "ref") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Using {decision.name}
        <button type="button" className="text-muted-foreground underline" onClick={() => onDecide(null)}>
          Change
        </button>
      </p>
    );
  }
  if (decision?.kind === "custom") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        New custom exercise: “{name.trim()}”
        <button type="button" className="underline" onClick={() => onDecide(null)}>
          Change
        </button>
      </p>
    );
  }

  const [best, ...rest] = suggestion.candidates;
  if (suggestion.status === "EXACT" && best) {
    const same = normalizeExerciseName(best.name) === normalizeExerciseName(name);
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        {same ? best.name : `Matches ${best.name}`}
        {best.source === "starter" && " · added to your library when saved"}
      </p>
    );
  }
  if (suggestion.status === "NONE") {
    return (
      <p className="text-xs text-muted-foreground">
        New exercise — it will be added to your library as “{name.trim()}”.
      </p>
    );
  }

  const choose = (c: { ref: string; name: string }) => onDecide({ kind: "ref", ref: c.ref, name: c.name });
  return (
    <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs" role="group" aria-label="Exercise name suggestion">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {suggestion.status === "HIGH" && best ? (
          <>
            We think you meant <span className="text-primary">{best.name}</span>.
          </>
        ) : (
          "Which exercise did you mean?"
        )}
        {suggestion.usedAi && <span className="font-normal text-muted-foreground">(suggested by Violet)</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(suggestion.status === "HIGH" && best ? [best] : [best, ...rest].slice(0, 3)).filter(Boolean).map((c) => (
          <Button key={c!.ref} type="button" size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => choose(c!)}>
            Use {c!.name}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={openChoices}>
          Choose another
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onDecide({ kind: "custom" })}>
          Keep “{name.trim()}” as new
        </Button>
      </div>
      {choosing && (
        <select
          aria-label="Choose an exercise"
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          defaultValue=""
          onChange={(e) => {
            const c = choices?.find((x) => x.ref === e.target.value);
            if (c) choose(c);
          }}
        >
          <option value="" disabled>
            {choices ? "Select an exercise…" : "Loading…"}
          </option>
          {(choices ?? []).map((c) => (
            <option key={c.ref} value={c.ref}>
              {c.name}
              {c.source === "starter" ? " (add to library)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
