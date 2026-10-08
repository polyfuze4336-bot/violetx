# Workout engine

The lifecycle Violet connects: **Plan → Train → Log → Recover → Analyse → Adapt → Repeat.**

```
Program (template) ─► Today ─► Start workout ─► Active workout ─► Finish ─► History
                                   │                 │                        │
                          previous performance   set logging + PRs     analytics · goals ·
                          + explainable target   + rest timer          weekly review · gym journey
```

## Start & active workout (`/dashboard/workout`)
* **Today** shows the next template of the active program (a template scheduled for today's weekday, else
  the next in rotation) with an estimated duration.
* Starting copies the template's exercises **and targets** onto the workout. Starting while a workout is in
  progress resumes it (one active workout at a time).
* State lives in Azure SQL (`WorkoutSession.status = IN_PROGRESS`); every ✓ writes the set immediately, so a
  browser refresh never loses data. The rest timer persists in `localStorage`.
* Per exercise: last session's sets, today's target with a **"Why?"** rationale, large weight/reps steppers,
  RPE, warm-up flag, replace (only before sets exist), skip, notes, remove, add exercise, history link.
* Finishing records session RPE/difficulty/notes and an optional gym (creates one `GymVisit` per gym per
  day). A workout with no sets is discarded.

## Rest timer
Presets 30 s / 60 s / 90 s / 2 m / 3 m, custom seconds, +30 s, pause/resume, skip, auto-start after a set.
Uses vibration, a short beep and (optionally) browser notifications; the workout works without them.

## Deterministic rules (`src/lib/workout-engine.ts`)
**PR detection** (against sets from *earlier* sessions; first-ever performance is a baseline, not a PR;
warm-ups never count):
* *Weight PR* — heavier than any previous working set.
* *Rep PR* — most reps ever at the *same* load (a new load is a reference point, not a record).
* *Estimated 1RM PR* — Epley `w × (1 + reps/30)` beats the previous best (an estimate, never an actual 1RM).
* *Volume PR* — this session's volume for the exercise beats any previous session.

**Progressive overload** (double progression, always explained):
* Top of the rep range on every top set in the last two sessions → add load (+1 kg under 20 kg, +2.5 kg,
  +5 kg from 100 kg). One session suffices when there is only one.
* Very high effort (RPE ≥ 9.5) → hold the load.
* Below the bottom of the range two sessions in a row → suggest ~7 % less.
* Otherwise stay and add a rep.
* No history → baseline guidance (pick a weight with ~2 reps in reserve).

Suggestions are *guidance from logged data*, never a guarantee of safety.

**Assisted exercises** (`src/lib/progression-type.ts`): an exercise is `ASSISTED` when its equipment is
*Assisted Machine* (or, for imported free-text names, its name says "assisted"); otherwise `WEIGHTED`. No schema
change is involved. For assisted lifts the logged weight is *assistance*, so **less assistance = progress**:
* *Assistance PR* replaces the Weight PR ("5 kg less assistance (30 → 25 kg)"); a Rep PR still means more reps at
  the same assistance. Estimated 1RM and volume are not computed.
* Suggestions add reps first, then lower the assistance. Charts label "Lower assistance = stronger" and flip the axis.
* Violet receives `ASSISTANCE` progressions ("improved from 40 kg assistance to 25 kg assistance while maintaining 8 reps").

## Programs (`/dashboard/programs`)
Create, edit, duplicate, archive, set active; presets (PPL, Upper/Lower, Full body); start any day directly.
Violet can **propose** a program — see [AI-SAFETY.md](./AI-SAFETY.md).

## Testing
`workout-engine.test.ts`, `workout-service.test.ts`, `programs.test.ts`, `program-service.test.ts`,
`v2-scenario.test.ts` (full lifecycle on the pure engines).
