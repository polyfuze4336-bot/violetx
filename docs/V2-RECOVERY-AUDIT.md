# V2 recovery audit

**Date:** 2026-10-07 · **Repository state:** `main` @ `f59f59d` (in sync with `origin/main`, working tree clean)
**Scope:** assessment only. No features were added or removed while producing this audit.

## 1. What actually happened

A single, very large "VioletX V2" prompt was executed in one session as 12 phases, each committed separately
(`bd6c0cd` … `f59f59d`, 12 phase commits + 1 encoding fix). Relative to the last pre-V2 commit (`e6344d3`):
**105 files changed, +10.6k / −0.2k lines** — 56 in `src/lib`, 22 in `src/components`, 14 in `src/app`, 4 new
migrations, 5 docs files, README. `package.json` is unchanged since V2 started; the only dependency added during
this work stream earlier was `fflate` (chat-export `.zip`). Nothing pre-existing was deleted; changes to old files
were additive (new columns, new nav items, new sections on Home/Records/History/Training/Settings/Gym).

The previous AI-generated change set was **never run against a database in development** (there is no local SQL
Server), so correctness rested on unit tests with mocked repositories, a full production build, and — after
deploy — a live smoke test. This audit adds a fuller live check.

## 2. Evidence used

| Evidence | Result |
| --- | --- |
| `npm install` | up to date, no peer/missing errors |
| `npm run lint` | ✔ no warnings or errors |
| `npm run typecheck` | ✔ clean |
| `npx prisma validate` | ✔ schema valid |
| `npm test` | ✔ **201 tests / 26 files** pass |
| `npm run build` | ✔ compiled; only the long-standing `@azure/monitor-opentelemetry` / `require-in-the-middle` "critical dependency" warnings (App Insights, pre-V2) |
| Migrations | 10 in repo; production deploy log: "10 migrations found … 0007–0010 applied … successfully applied". All additive. |
| CI / deploy | latest CI and deploy runs on `main` ✅ |
| Live smoke (production, owner session) | 23 routes → **all HTTP 200**, **0 console errors, 0 page errors, 0 hydration errors, 0 failed same-origin requests** |
| Live interaction | sidebar: 19/19 links navigate · Analytics range tabs · Training weekly/monthly · Review previous-week · exercise search · "Custom exercise" dialog · "Create with Violet" panel · mobile bottom nav + More drawer (20 items) |
| Live server actions exercised | start workout, add exercise, log set (rest timer auto-started, survived refresh), discard workout (draft removed) · Violet "How am I doing?" / "How is my bench…?" · create + revoke share link |
| Share link (unauthenticated `curl`) | 200 with `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`; no nutrition/gym text present; malformed token → 404; revoked state confirmed in Settings; logged-out `/dashboard/*` → 307 to `/signin` |
| Page latency (production, current data) | 0.4–1.8 s to DOM-ready |

Legend — ✅ WORKING (implemented **and** verified: tests and/or live) · ⚠️ PARTIAL · ❌ BROKEN · 🟡 UNTESTED (looks
implemented; no live verification, usually mock/unit tested only) · 🔵 NOT IMPLEMENTED.
**No feature is currently ❌ BROKEN.**

## 3. Classification

### 3.1 Pre-V2 features (regression check)
| Feature | Status | Evidence / note |
| --- | --- | --- |
| Authentication (DB credentials, lockout, sessions) | ✅ | live sign-in; logged-out redirect; 56+ older tests |
| Dashboard / Home (original cards, timeline, heatmap) | ✅ | live 200, no errors |
| Body weight, Measurements, Strength, Records, History, Compare, Notes | ✅ | all load live; no errors; old pages visually redesigned earlier (charts/matrix) |
| WhatsApp paste import + Violet interpreter | ✅ (page) / 🟡 (commit) | page + parser tests; commit path not re-run in this audit |
| WhatsApp **chat export** import (.txt/.zip) | 🟡 | parser unit-tested; the earlier production "Something went wrong" was fixed by DB retries/sequential checks — **user has not re-confirmed on a real export** |
| Nutrition logging | ✅ (page) | page loads; entry create/delete untouched but not re-run |
| Gym Journey (map, visits, branch totals from DB) | ✅ | live 200; original analytics tests pass |
| Coach share link (create/view/revoke) | ✅ | exercised live end-to-end |
| Coach (read-only) role | 🟡 | RBAC proven by unit tests (incl. cross-service table); **no COACH account exists to exercise the UI live** |
| Demo / guest access | 🔵 | no demo mode exists in the repo; login is credentials-only |
| Azure deploy (OIDC, migrate, standalone) / CI | ✅ | latest runs green |

### 3.2 V2 foundation & workouts (phases 1–3)
| Feature | Status | Evidence / note |
| --- | --- | --- |
| Migrations 0007–0010 (additive) | ✅ | applied in prod; every page that reads new tables returns 200. ⚠️ generated with `prisma migrate diff` (no shadow DB) |
| Exercise library fields, custom exercise dialog, search/filter | ✅ | live: search + dialog; 5 data-integrity tests |
| Starter library seeding (`Starter library` button) | 🟡 | unit-tested data/idempotent keys; not clicked live (writes) |
| Workout session lifecycle (start / resume) | ✅ | live |
| Active workout: previous performance, target + rationale, steppers, persistence on refresh | ✅ | live (11 kg × 9 last time; target 11 kg × 6–10; set persisted) |
| Active workout: replace / skip / notes / remove exercise, edit/delete set, warm-up, RPE | 🟡 | service tests; not clicked live |
| Rest timer (presets, custom, +30 s, pause, skip, auto-start, persistence) | ✅ core / 🟡 extras | auto-start + refresh persistence live; notifications, vibration, beep untested |
| Finish workout (session RPE/difficulty, summary, gym visit, discard-if-empty) | 🟡 | mock-tested; discard path live; completing a real workout avoided (would create a real record) |
| PR detection (weight / rep / e1RM / volume) + celebration overlay | ✅ engine / 🟡 overlay | 14 engine tests; overlay never triggered live |
| Progressive-overload suggestions with rationale | ✅ | engine tests; live target + "Why?" rendered |
| Exercise detail: last performed, best, e1RM, chart, instructions/tips | ⚠️ | instructions/tips/aliases added; **"recent volume" stat from the spec is not shown** |
| Superset grouping | ⚠️ | column exists; **no UI** |
| `ExerciseMuscle`, `PersonalRecord` tables | 🔵 (deliberate) | replaced by fields / derived PRs — documented in `DATA-MODEL.md` |

### 3.3 Programs, goals, recovery (phases 4–5)
| Feature | Status | Evidence / note |
| --- | --- | --- |
| Programs list/page, presets, "Create with Violet" panel | ✅ (renders) | live |
| Create / edit / duplicate / archive / set-active / start-from-template | 🟡 | service + RBAC tests with mocks; not exercised live |
| Today's workout selection (weekday / rotation) + Today card | ✅ logic / 🟡 UI | pure tests; no active program exists in prod to display |
| AI program proposal → review → confirm → audit | 🟡 | validation/fallback/audit tested with mocks; not run live |
| Goals (6 types, trajectory) | ✅ logic / 🟡 UI | 15 tests; page loads; create dialog not run live |
| Daily check-in, readiness score, explanation, trend | ✅ logic / 🟡 UI | tests; page loads; saving not run live |
| Coach sees readiness scores but not notes/HR | ✅ | service test + live link check |

### 3.4 Analytics, Violet, review, nutrition, gym (phases 6–9)
| Feature | Status | Evidence / note |
| --- | --- | --- |
| Analytics page (7D–ALL, volume, muscle, PR timeline, e1RM, weight-vs-strength, adherence, observations) | ✅ | live with real data; tabs navigate; 8 engine tests |
| Violet Q&A (grounded, "How am I doing?") | ✅ | live; **Azure OpenAI is active in production** (answer was LLM-formatted and passed the number guard); rule fallback unit-tested |
| Violet "analyses workout" after finishing | 🔵 | spec scenario step not built |
| Weekly review (+ week navigation) | ✅ | live; 8 tests; ⚠️ observation text is rule-based, no AI wording |
| Nutrition targets, today progress, calories chart, cautious trends | ✅ (page) / 🟡 (saving targets) | page loads; save not run live |
| Gym Journey ↔ workouts (picker, visit on finish, workouts by gym, achievements) | ✅ logic / 🟡 UI | pure tests; page loads; picker/search not run live |

### 3.5 Coach, home, mobile (phases 10–11)
| Feature | Status | Evidence / note |
| --- | --- | --- |
| Coach link: goals, consistency, strength, volume, workouts, readiness | ✅ | live (goals/readiness sections render only when data exists — none yet) |
| Privacy of link (no nutrition/notes/HR/gym names; headers) | ✅ | live + tests |
| Home hero (today, readiness, week, weight, strength, gym, insight, PR, goals) | ✅ | live |
| Bottom nav (Home/Workout/Progress/Violet/More) + coach variant | ✅ owner / 🟡 coach | owner verified at 390 px; coach variant logic only |
| Mobile ergonomics (16 px inputs, tap handling, safe area) | ✅ CSS / 🟡 device | no real-device gym test |
| Framer Motion "smooth transitions" | ⚠️ | used for the PR overlay (and existing fade-ins); not app-wide |

### 3.6 Quality gates & docs
| Item | Status | Note |
| --- | --- | --- |
| Unit tests (201) | ✅ | pure logic + mocked services |
| Integration tests against a real DB | 🔵 | none; no local SQL Server |
| Browser E2E suite in repo | 🔵 | live checks were ad-hoc this session |
| Interaction audit (dead buttons/links) | ✅ static + live | script found no dead buttons/links; 19/19 nav links work |
| README + 5 docs | ✅ | match the code; this file adds the verification caveats |

## 4. Issues and risks found (none blocking)
1. **Write paths verified only by mocks** (see 🟡 rows). Highest-value to verify first: *finish workout*, *create program*, *save check-in*, *create goal*, *seed library*, *save nutrition targets*, *chat-export commit*.
2. **Schema/migration provenance:** migrations were generated by `prisma migrate diff`, never replayed on a clean database; `prisma format` also reflowed `schema.prisma` (large whitespace-only diff, 393 lines).
3. **Scaling:** Home/Analytics/Review each load *all* sets (`exerciseEntryRepository.list`) several times per request. Fine at today's size (≤1.8 s); will degrade with years of data.
4. **Navigation bloat:** 19 sidebar items / 20 in the mobile More drawer — functional, but dense.
5. **Leftovers:** `.github/workflows/bootstrap-owner.yml` and `scripts/has-owner.ts` are one-off admin tools still in the repo (harmless; need an owner/secret to run).
6. **Process incident (resolved):** a Python edit step wrote cp1252 bytes into 3 files and broke the build; fixed (`57e6d34`) and verified no invalid UTF-8 remains.
7. **Time zone:** server "today" uses `APP_TIMEZONE` (default Asia/Kuala_Lumpur) while forms use the browser's date — consistent for a Malaysian athlete, not for travel.
8. **Pre-existing warning:** App Insights/OpenTelemetry "critical dependency" build warning (unchanged by V2).

## 5. Recovery plan

### Retain (all of V2 — it builds, deploys and loads cleanly)
Migrations 0007–0010 · workout engine + active workout + rest timer · exercise library · programs · goals ·
recovery · analytics · weekly review · Violet Q&A (with the number guard) · coach link extensions · Home hero ·
bottom nav · docs.

### Repair / verify next (stabilisation, no new features)
1. Walk the 🟡 write paths on production **or a staging copy** and tick them off in this table (finish a real
   workout → PR overlay → history/analytics/goal/review update → gym visit).
2. Add a Playwright smoke suite (login, each route, start→log→discard, share link create/revoke) so these
   checks are repeatable; run it in CI against a seeded test database.
3. Replay all migrations on a clean SQL Server (CI shadow DB) to confirm 0001→0010 from scratch.
4. Confirm the WhatsApp chat-export import on a real export (the earlier user-reported failure).
5. Create a COACH account (or a test fixture) and verify the coach navigation/pages live.
6. Small gaps worth closing: "recent volume" on exercise detail; decide on superset UI vs. dropping the column; "Violet analyses workout" post-finish card.

### Do NOT touch yet
* Migrations 0001–0010 (already applied in production — never edit; only add).
* `ExerciseEntry` semantics (set = row, `setType`, warm-up exclusion) — everything derives from it.
* The PR/overload engines and the AI validation guards (`usesOnlyKnownNumbers`, Zod schemas) — they are test-backed and safety-critical.
* Auth/RBAC and the share-link privacy filter.
* Navigation restructuring, further dashboard redesign, and new roadmap items (Apple Health, wearables, cardio, voice) until stabilisation items 1–5 are done.
* Query-performance refactors (batch/aggregate loaders) — measure first when data volume grows.

**Bottom line:** the application is in a buildable, deployed, error-free state. The remaining work is verification and
hardening, not repair of broken features.
