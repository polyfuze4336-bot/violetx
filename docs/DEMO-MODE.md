# Demo mode (prototype showcase)

A read-only demo account lets anyone explore VioletX with realistic **fictional** data, without touching a real athlete.

> **Prototype only.** The credentials below are public by design. Do not use this pattern in production.

| | |
|---|---|
| Username | `demo` |
| Password | `violetx` |

## How it works

* **Role `DEMO_VIEWER`** (`src/lib/rbac.ts`) is stored in `User.role` (a string column, so no schema change).
* The demo user owns its **own fictional athlete**. It never reads the real athlete: `resolveAthleteId` maps `DEMO_VIEWER` to the demo user's own athlete, unlike a coach (who reads the owner's).
* **Read-only is enforced on the server.** Every write path goes through `requireOwner()` / `requireOwnerAthlete()`, which now refuse `DEMO_VIEWER` with `403 "Demo mode is read only."`. Disabled buttons are not relied on: the UI simply lets the action run and shows that message in the usual error toast.
  * Read-only owner-style features the demo may use call `requireOwnerOrDemo()` instead (asking Violet a question). Turning chat text into records, accepting AI proposals, importing, settings, share links, workouts, goals, nutrition, measurements and programs are all refused.
  * The password-reset flow refuses the demo account, and a wrong demo password never locks the shared account.
* **Login is off by default.** The sign-in form accepts a username, but `demo` only works when the deployment sets `DEMO_MODE_ENABLED=true`. With it off (the default, including production), neither `demo` nor the demo email can sign in, even if the account exists in the database.
* **UI.** A `DEMO MODE` banner is shown on every dashboard page. The demo viewer sees the owner experience (including nutrition and Violet) but not the Workout, Import and Settings pages, which only make sense for writing.

## Demo data

`src/lib/demo-data.ts` generates ~20 weeks of deterministic fictional history ending on the day you seed:

* body weight with normal fluctuation, a plateau and a holiday bump; waist and other measurements; nutrition; recovery check-ins with two rough stretches; goals (including an achieved one); notes; programs (an archived full-body block and an active Upper/Lower program); gym visits at real branches in your database; one AI audit entry;
* adherence that varies week to week;
* Bench Press `70x8 > 72.5x8 > 75x8 > 75x10 > 77.5x8 > 80x8`, Assisted Chin-Up (assistance) `45x8 > 40x8 > 40x10 > 35x8 > 30x8 > 25x10`, Squat `80x8 > 85x8 > 90x6 > 90x8 > 95x6`, plus 13 supporting lifts. These produce weight, rep, assistance and estimated-1RM PRs in history, and volume PRs when the workout engine replays the sessions.

## Seeding

```bash
# Create or refresh the demo account and its data (idempotent)
ALLOW_DEMO_SEED=true npm run seed:demo

# Preview without a database
npm run seed:demo -- --dry-run

# Remove the demo account and its data
ALLOW_DEMO_SEED=true npm run seed:demo -- --remove
```

Then set `DEMO_MODE_ENABLED=true` on the app (App Service setting or `.env.local`).

Safety rules:

* The seed **refuses to run** unless `ALLOW_DEMO_SEED=true`. It is not part of `build`, `postinstall`, `test`, CI or the deploy workflow, so it never runs automatically against production.
* **Idempotent:** it rebuilds the demo athlete's rows (delete + insert, with stable ids), so running it twice does not duplicate anything. Re-seeding on a later day shifts the history so it again ends "today".
* It only touches the demo user's athlete. It aborts if `demo@violetx.demo` already belongs to a non-demo account, and it never modifies other athletes' data.
* On Azure, run the manual **Seed demo account (prototype)** workflow (`.github/workflows/seed-demo.yml`). It requires typing `seed-demo` to confirm and can switch `DEMO_MODE_ENABLED` on. To turn demo login off again, remove that app setting (or set it to anything but `true`).

## Tests

* `demo-readonly.test.ts` calls every exported server action as `DEMO_VIEWER` with junk input and asserts each is refused with the read-only message and that **no database write is attempted**. It also covers direct service calls, the lack of other write endpoints, the login rules and the password-reset guard.
* `demo-pages.test.ts` renders every major page for the demo account against the seeded dataset, in-memory, and checks nothing is written.
* `demo-data.test.ts` checks the story (progressions, every PR type, non-linear trends) and determinism; `demo-seed.test.ts` checks idempotency, isolation from real data and the command guards.
