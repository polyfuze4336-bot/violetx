# WhatsApp import types and navigation

## Import types

A WhatsApp message can mean three different things, and VioletX never guesses silently:

| Type | Meaning | Saved as |
|---|---|---|
| **PR / Progress Update** | "These are the things I improved." Selected exercises only. | `WorkoutSession.status = PR_UPDATE` |
| **Partial Workout** | "This is only part of what I did." | `WorkoutSession.status = PARTIAL` |
| **Full Workout** | "This is everything." | A normal `COMPLETED` session with its `WorkoutExercise` structure |

Flow: WhatsApp text → extraction (deterministic parser, optionally the LLM) → exercise matching
(exact, alias, fuzzy, AI shortlist) → **import interpretation** → review → confirm → save. Nothing is
written before the user confirms.

* The **recommendation** (`recommendImportType`) is rule-based over the extracted sets and the wording
  ("PR", "full workout", ...). The user can always change it in the review. If a caller does not pass an
  `importType`, the service defaults to `PARTIAL`, never to a completed workout.
* No schema change: `WorkoutSession.status` is a free string, so `PR_UPDATE` and `PARTIAL` fit next to
  `COMPLETED / IN_PROGRESS / SKIPPED`. Every query that counts workouts, adherence, gym visits or program
  progress already filters `status = COMPLETED`, so incomplete imports are excluded by construction.

### Claimed PRs are verified, never trusted

`importService.assess` runs the existing PR engine (`detectPrEvents`) on the recorded history before the
import day plus the submitted sets. The AI never decides whether a PR exists.

| Status | Meaning |
|---|---|
| `CONFIRMED_PR` | The engine finds a Weight / Rep / Assistance PR (with previous best and delta) |
| `NOT_A_PR` | No new record. "PR bench 80 x 10" with 80 × 11 on record shows *PR claim detected* and is saved as a progress entry |
| `FIRST_RECORD` | No earlier history for the exercise (a baseline, not a PR) |
| `SUPPORTING` | Another set in the same import already carries the PR (one achievement, not several) |
| `UNRESOLVED` | The exercise name still needs the user's confirmation |

Because PRs are derived from the sets, saving a non-PR can never create a false achievement.

### Missing is unknown, not zero

Sets from a PR update or partial workout are real data, but their day is **not** a workout day:

* Analytics (`totals.workouts`, `workoutsPerWeek`, consistency, adherence), the weekly review, the Progress
  periods and Violet's workout count ignore them for session counting; `incomplete` / `progressUpdates`
  report them separately.
* Frequency, "muscle not trained" and weekly-volume tips and the lower-body observations are suppressed
  while recent records are incomplete; Violet says "based on your recorded exercises".
* The AI coach prompt forbids claims such as "you only did two exercises" or "you skipped legs".

### Parser formats

`Bench 80kg x 10`, `Bench 80x10` (load first when the left number cannot be a rep count),
`Hip abduction 9x50kg`, a heading line followed by `80 x 10` lines, continuation lines under a named set,
and `PR`/`PB`/🏆 wording (recorded as a claim; removed from the exercise name).

## Navigation

Five primary destinations on desktop and mobile: **Home · Workout · Progress · Violet · More**.

* **Workout** tabs: Today · History · Programs · Exercises. History lists workouts, partial workouts,
  PR / progress updates and WhatsApp imports (filterable).
* **Progress** tabs: Overview · PRs · Exercises · Body (Weight / Measurements).
* **More** (`/dashboard/more`) groups everything else: Training insights, Health & tracking, Journey,
  Sharing, Account. Start workout and Import WhatsApp are quick actions on Home, Workout and More.

Tabs link to the existing pages, so no route was moved or removed. `NAV_REDIRECTS`
(`src/lib/nav-redirects.mjs`) adds friendly aliases such as `/dashboard/progress/prs`. Coach share links
(`/share/coach/...`) are untouched.
