# Violet intelligence

Violet is a **layered** system. Deterministic code computes facts; AI (Azure OpenAI, optional) may phrase
or prioritise them. If AI is unavailable or its output fails validation, the deterministic result is used,
so every feature works without an AI key.

## Layers
1. **Evidence** — pure functions over recorded data (`training-analytics`, `analytics-engine`, `goals`,
   `readiness`, `weekly-review`, `nutrition-intel`, `violet-insights`).
2. **Rules** — hypertrophy heuristics (10–20 sets per muscle per week, frequency, volume jumps, stalled
   lifts, push/pull balance, rep ranges).
3. **AI** — receives *aggregated numbers only* (no raw notes, chat text or identifiers) and returns
   validated text/structures.

## Features
* **Coach Violet 2.0** (`/dashboard/coach`) — "How am I doing?" style questions are routed to Q&A; data
  messages still go through the import-proposal flow. Answers list real metrics ("Weight −1.4 kg · Bench est.
  1RM +4.8 % · Average protein 126 g/day"), state what is missing ("Not enough data yet for: nutrition logs"),
  and never fabricate. AI text is accepted only if every precise number appears in the evidence.
* **Weekly review** (`/dashboard/review`) — training, strength/PRs, body, recovery, consistency, nutrition,
  Violet's observation and *proposed* next-week actions. Week navigation included.
* **Training analytics** (`/dashboard/analytics`) — 7D / 30D / 3M / 6M / 1Y / ALL: workouts, volume, sets,
  consistency, volume by muscle and exercise, frequency, PR timeline, estimated-1RM trends, weight vs strength
  (indexed to 100 to avoid false precision), body measurements, session duration/RPE, program adherence, and
  plain-language muscle-distribution observations.
* **Goals** (`/dashboard/goals`) — progress and trajectory from data; a projection is only shown with ≥ 3
  readings across ≥ 7 days and is flagged when the trend moves away from the target.
* **Recovery** (`/dashboard/recovery`) — quick daily check-in → readiness 0–100 (sleep 30 %, energy 20 %,
  soreness 20 %, stress 15 %, motivation 15 %) with a non-diagnostic explanation. Resting HR is shown but not scored.
* **Nutrition** — targets, today's progress and cautious descriptive trends ("an association in your own data,
  not proof of cause").
* **Training page** (`/dashboard/progress`) — weekly/monthly volume, muscle balance, progress table, rule-based
  tips with an on-demand AI review.

## Privacy
Patient X is never named. Coach views and share links exclude nutrition, notes, check-in notes/heart rate
and gym names. See [AI-SAFETY.md](./AI-SAFETY.md).
