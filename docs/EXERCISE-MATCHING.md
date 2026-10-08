# Exercise name matching

Typed or imported exercise names are matched against the canonical library so a spelling mistake never creates a duplicate exercise.

## Workflow (`src/lib/exercise-matching.ts`, pure)
1. **Normalise** — lowercase, trim, collapse spaces, punctuation → spaces, plural/abbreviation canonicalisation (`DB` → dumbbell).
2. **Exact** — equal to a canonical name or alias, ignoring spacing (`Lat Pull Down` = `Lat Pulldown`). Resolved without asking.
3. **Fuzzy** — a small common-misspelling table, then edit distance + token overlap against names and aliases.
   Equipment/variation words (assisted, barbell vs dumbbell, abduction vs adduction…) that differ cap the score below
   "high", so *assisted* and *unassisted* are never merged.
4. **AI (only when uncertain)** — `src/ai/exercise-match.ts` receives one untrusted name and a numbered shortlist chosen by the
   app and returns list positions + confidence. `applyAiCandidates` drops anything out of range, so the model can never
   invent an exercise or id, and it cannot reach high confidence for a different variation.

Status: `EXACT` · `HIGH` ("We think you meant X") · `AMBIGUOUS` (pick one) · `NONE` (new custom exercise).

## Where it applies
* **WhatsApp import and Violet chat** — each exercise row shows the proposal; saving is blocked until every proposed
  correction is accepted, replaced with another exercise, or kept as a new custom exercise. Unknown names are allowed as
  custom exercises.
* **New exercise forms** (library dialog, Settings) — warn about a canonical/similar exercise before creating.
* **Search** (library, workout picker) tolerates typos.

## Safety
* The client sends an `exerciseRef` (`id:<id>` or `starter:<canonical name>`). The server validates it against the
  athlete's library / the starter list; unknown refs are rejected (`NotFoundError`).
* Without a confirmed ref, only an **exact** name/alias match is reused; fuzzy matches are never applied silently.
* Historical sets are never rewritten. A confirmed spelling is remembered as an alias (unless another exercise owns it).
* No schema change.

## Library
`STARTER_EXERCISES` covers the main muscle groups with barbell, dumbbell, cable, Smith machine, plate-loaded, selectorized
machine, assisted machine and cardio exercises. It is generic commercial-gym equipment, not any one branch's inventory.
Fuzzy matching handles misspellings, so only genuine alternative names are stored as aliases.
