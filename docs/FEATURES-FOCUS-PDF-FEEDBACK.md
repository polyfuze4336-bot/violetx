# Focus reminders, coach PDF, name cleanup, feedback

## Focus next (longest without a PR)
`staleRecordFocus` (`src/lib/pr-focus.ts`) ranks lifts by days since their last PR from the PR engine's
events. Only lifts with 3+ recorded sessions that were trained in the last 45 days count, and gaps under
14 days are normal training. A lift that never broke a PR is measured from its first recorded session.
Shown on Home ("Focus next") and in Violet ("What should I focus on next?"). Assisted lifts talk about less
assistance. It is a reminder in the app, not a push notification.

## Data is grounded in recorded sets
Every figure comes from sets that were entered or imported. "Heaviest recorded lifts" ranks the real heaviest
set per exercise, never an estimate. Estimated 1RM (Epley) is always labelled as calculated. Application code
never generates random data (a test enforces it); only the clearly labelled demo account is fictional.

## PDF for the coach
`GET /dashboard/export/progress[?exercise=<id>]` returns a PDF (pdf-lib, standard fonts) with per-exercise
best sets, PR history, a top-set trend line and notes on how numbers are derived. Buttons: Progress > PRs and
each exercise page. No ids, emails or notes are included. Read-only: the athlete, a coach or the demo viewer
may export what they can already see.

## Correct exercise names after upload
Exercises > "Possible spelling mistakes" lists saved exercises that look misspelled (rename to the canonical
name) or duplicated (merge into the exercise you already have). A rename keeps all sets and remembers the old
spelling as an alias. A merge moves sets, workout rows, template rows and goals, then removes the emptied
duplicate. Targets are validated against your own library or the canonical list; owner only.

## Bug reports and feature requests
More > Report a bug / request a feature (also in the account menu). Stored in `FeedbackReport`
(migration 0011). The athlete sees their own reports; the primary owner (OWNER_EMAIL) sees all of them with
anonymous reporter codes and can set a status. Limit 20 reports per account per day; telemetry records only
that a report was filed, never its text.
