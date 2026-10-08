# VioletX — Prototype Readiness

Final end-to-end validation. Production: `https://violetx-web-v6s4btstixeoe.azurewebsites.net`

**Verdict: READY for demonstration.** No critical test is failing. Limitations are listed honestly at the end.

## Automated validation

| Check | Result |
|---|---|
| `npm run lint` | PASS (0 warnings/errors) |
| `npx tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 496 tests, 37 files |
| `npm run build` | PASS |
| CI + "Deploy to Azure App Service" | PASS (green) |

## Capability matrix

| Capability | Status | Evidence |
|---|---|---|
| Owner access | PASS* | Authorization + full journey (start workout → log sets → finish → Progress/Analytics/Violet/Goals/Nutrition/Measurements/Gym Journey → coach link → logout) run against the real services on an in-memory database (`owner-journey.test.ts`). *Owner login/writes were **not** exercised on production, by decision, to avoid touching real data. |
| Demo access | PASS | Live: "View Demo" and `demo` / `violetx` sign in; 18 dashboard pages return 200, 42 internal links unbroken, zero console errors; refresh/deep link keep the session; DEMO MODE banner shown. |
| Demo is read only | PASS | Live: add weigh-in, archive goal, duplicate program, start workout all refused with "Demo mode is read only." (desktop and phone). Unit tests call every write service/action as DEMO_VIEWER → 403. |
| Coach sharing | PASS | Live: create → open anonymously → read-only view → revoke → "This coach link is no longer available." POST/PUT/DELETE on share routes → 405; invalid/expired/revoked links give the same friendly 404 (no account disclosure). Tests cover valid/invalid/expired/revoked, write attempts and direct API writes. |
| Workout logging | PASS (in-memory) | Start, add sets, finish, discard verified with the real services. |
| Weight PR | PASS | Detected on finish (in-memory journey + unit tests). |
| Rep PR | PASS | Same-load, weight-aware (80×8 → 80×10 = REP PR; 60×15 vs 100×10 is not). |
| Assistance PR | PASS | Chin-Up 40→35 kg assist = ASSISTANCE PR "Less assistance"; 35×8→35×10 = REP PR; no e1RM/volume for assisted. |
| 1RM PR | PASS | Epley estimate, labelled as estimated; excluded for assisted lifts. |
| Volume PR | PASS (scope) | Detected at workout completion and shown in the finish summary. It is not derived from history on the Records page. |
| Assisted charts | PASS | Strength/Records charts flip the axis, label "Lower assistance = stronger", rows read "kg assistance"; Compare, Dashboard recents, History and the timeline now say "assistance". |
| Exercise correction | PASS | "lat pulldwon", "bench pres", "assissted chin", "cable roww", "leg pres" and more map to canonical exercises (no duplicates); unknown → custom after confirmation; confirmed spellings become aliases. |
| Analytics | PASS | Pages render with demo data; Progress/Analytics reflect new training in the journey test. |
| Violet | PASS | Q&A works (Azure OpenAI in prod; deterministic fallback). Bug fixed: "How is my strength progressing?" was answered with the generic progress summary. Rep and assistance progress are phrased as improvement. |
| Mobile | PASS | 390 px: sign-in + 11 dashboard pages 200, no horizontal overflow, demo mutation refused on touch. |
| Clickable UI audit | PASS | Every button on every demo page clicked. Controls either act, navigate, or show the demo read-only toast. Remaining "no change" results were already-selected defaults (first exercise chip, "All", "Top set"), form-validation on empty submit, and the empty Violet send button. |
| Azure deployment | PASS | Pipeline green; `/api/health` 200; `/dashboard` redirects to `/signin?callbackUrl=…`; share routes 405 on writes. |

## Bugs found and fixed in this pass

1. **Violet intent routing** — strength questions were swallowed by the generic "progress" summary (`violet-insights.ts`).
2. **Transient HTTP 500 on first load** after demo sign-in / after a deploy — database retry only looked at `error.code`; Prisma initialisation errors use `errorCode`, and connection-lost errors were not retried for reads (`db.ts`). Likely cause: Azure SQL serverless auto-pause.
3. **Strength page** — rendered ~1100 set rows (1100+ buttons) and charted assisted lifts inverted ("max assistance = best"). Now capped to latest 100 rows and assisted-aware (`reverseY` axis, "Lower assistance = stronger").
4. **Assisted wording missing** on Dashboard home (recent sets, recent PR card, timeline), History timeline sets and Compare page (which treated *more* assistance as a larger "increase"). `ExerciseEntryDTO` now carries an `assisted` flag.
5. **Records chips** showed only the 8 most-trained lifts, hiding Bench Press in the demo; raised to 12.

## Known limitations

- Owner write flow verified in-memory, not on production data.
- The 500-on-first-load mitigation (bug 2) is unit-verified but cannot be forced in production (needs the DB to pause); watch Application Insights after an idle period.
- Volume PR appears in the workout-finish summary only.
- Local `az` has no access to the production subscription, so server logs/App Insights were not queried; the browser console and HTTP status were used instead.
- Demo credentials (`demo` / `violetx`) are for the prototype only and are gated by `DEMO_MODE_ENABLED`.
