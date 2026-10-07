# AI safety

**Violet never modifies fitness data on her own and never touches the database.**

```
Data → AI analysis → structured proposal → Zod validation → user review/edit
     → explicit confirmation → service layer (RBAC) → repository → Azure SQL
```

## Rules
* **No raw SQL, no credentials, no tools.** The model returns JSON or text only.
* **Untrusted input.** WhatsApp text, chat questions, exercise names and program requests are data, never
  instructions. System prompts are fixed; injection attempts are flagged for telemetry (`detectInjection`)
  and cannot change rules, permissions or scope.
* **Validation.** Every AI payload is parsed with Zod before anyone sees it (program proposals, tips, answers).
  Invalid output → deterministic fallback, never a half-trusted result.
* **Grounding.** Q&A answers may only cite numbers present in the evidence snapshot; otherwise the
  deterministic answer is returned. Missing data is stated, not guessed.
* **Review before save.** Programs and imports are shown for editing; confirming re-validates server-side.
  Saved AI-assisted changes are recorded in `AIProposalLog` / `AIAction` (provider, model, approver, payload).
* **Server-side RBAC.** Only the OWNER can ask Violet, propose or confirm. COACH requests receive 403 from the
  service layer (`requireOwnerAthlete()`); hiding buttons is never relied upon.
* **Medical.** Output is fitness/recovery guidance, not medical advice; pain or injury → see a professional.
* **Privacy.** AI receives aggregated numbers (and exercise names, truncated to one line); never notes,
  imported chat text, names, e-mail or secrets. Full imports are never logged to Application Insights.
* **Auth.** The AI path uses the App Service managed identity (no API key in source).

## Where it lives
`src/ai/*` (client, `coach.ts`, `coach-qa.ts`, `program.ts`, `llm.ts`, `safety.ts`) · schemas in
`src/lib/program-schemas.ts` · guard `usesOnlyKnownNumbers` in `src/lib/violet-insights.ts`.

## Tests
Invalid/malformed AI output is rejected (`program-service.test.ts`), invented metrics are rejected
(`violet-insights.test.ts`), coach mutations are blocked (`coach-readonly.test.ts`).
