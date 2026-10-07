# Roadmap

VioletX **V2** (this release) is the workout, programs, goals, recovery, analytics, weekly review and
Violet-intelligence platform described in the README. The items below are deliberately **not** implemented
yet; each needs its own design, privacy review and data model.

## Next
* **Apple Health / Health Connect import** — sleep, resting heart rate and steps flowing into check-ins and
  readiness (keeping the "no medical advice" stance and explicit consent).
* **Wearable integration** — automatic recovery data (HRV, sleep stages) replacing manual check-ins.
* **Heart-rate analysis** — zones, session load, cardiac drift.
* **Running / cardio tracking** — GPS routes, pace, intervals as a new session type alongside strength.
* **Voice workout logging** — hands-free set entry in the gym ("bench, 80 for 8").

## Later
* **Exercise form analysis** and other **computer-vision** features (on-device where possible).
* **Coach collaboration** — comments, plan suggestions the athlete can accept (still proposals, never silent writes).
* **Multi-athlete support** — the schema is already athlete-scoped; needs coach↔athlete relations, per-athlete
  RBAC and an athlete switcher.
* Notification service workers for the rest timer and weekly review.

## Engineering
* Replace hand-edited migration generation with a CI shadow-database check.
* Playwright end-to-end suite against a seeded Azure SQL test database.
* Per-user timezone setting (currently `APP_TIMEZONE`, default `Asia/Kuala_Lumpur`).
