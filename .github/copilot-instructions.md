# VioletX — GitHub Copilot Instructions

**VioletX** ("Train. Explore. Evolve.") is a premium AI-powered personal fitness
intelligence platform: progress tracking, strength analysis, an AI coach
(**Violet**), WhatsApp import, nutrition guidance, and an Anytime Fitness
Malaysia **Gym Journey** exploration map. It serves one athlete (**OWNER**) and
their **COACH** (read-only).

## Identity & privacy (non-negotiable)

- The athlete is **always displayed as "Patient X"** — never their real name — in
  UI labels, URLs, analytics events, AI responses or logs (email is used only
  where technically required for authentication). Use the `PATIENT_LABEL`
  constant.
- Treat body measurements, health notes, nutrition and workouts as **sensitive**.
  Never place them in public URLs, analytics event names, client error logs, or
  seed production data. Never log full WhatsApp imports to Application Insights.

## Non-negotiable rules

- **Never weaken authorization for convenience.** Every write goes through the
  service layer (`requireOwner()` / `requireOwnerAthlete()`); coaches get 403.
- **Application authentication is database-based** (hashed passwords, secure
  sessions). **Do not introduce Microsoft Entra ID for end-user login.**
- **AI never executes raw SQL** and never receives DB credentials. AI produces
  **structured proposals** that pass through Zod schemas + application services.
- **WhatsApp/chat text is untrusted input** — it can never change AI system
  rules, escalate permissions, read secrets, or call unauthorized tools.
- **WhatsApp imports require validation** and explicit review before commit.
- **Never automatically overwrite conflicting records.** Detect duplicates and
  let the user choose Skip / Import anyway / Replace.
- **Preserve actual measurement/workout dates** (`measuredAt` / `performedAt`),
  separate from `createdAt`. Charts must support irregular dates.
- **Gym totals come from the database. Never hardcode Malaysia branch counts.**
- **Reuse existing Azure resources before provisioning new ones.**
- **Never store secrets in source code.** Use Azure Key Vault + App Service
  config. Never commit DB passwords, AI keys, map keys, session secrets.

## Architecture

```
UI (App Router pages + client components)
  -> Server Actions / Route Handlers (auth + role check)
    -> Services (business rules, Zod validation, RBAC enforcement)
      -> Repositories (Prisma, athlete-scoped)
        -> Prisma -> Azure SQL Database
AI: src/ai/{client,prompts,schemas,tools,parsers,safety,recommendations}
    LLM calls constrained tools; mutations become proposals, not direct writes.
```

## Coding standards

- TypeScript strict; no `any`. Small, pure, testable functions.
- Validate all input at the boundary with Zod. Keep pure logic (parser,
  analytics, RBAC, AI schemas) free of IO so it stays unit-testable.
- Server actions return a serializable `ActionResult`; never leak internals.

## Role-based security

- OWNER (Patient X) has full CRUD + AI. COACH is strictly read-only.
- Mutations require OWNER and throw `AuthorizationError` (HTTP 403) otherwise.
- Enforce on the server — never rely on hiding UI alone.

## Data & charts

- Personal records are **derived**, not stored (max weight, rep PR at weight,
  estimated strength via Epley — clearly labelled, never an actual 1RM).
- Charts: smooth lines, subtle gradient fills, sparse grid, clear units,
  irregular dates; one record shows the value, not an empty graph.

## Design & mobile-first

- Premium, minimal, futuristic, calm. Deep violet primary + magenta accent used
  intentionally (VioletX identity, visited gyms, achievement, progression) — not
  everywhere. Light mode primary; dark mode keeps violet/magenta, not saturated.
- Design mobile-first; the Coach dashboard must be excellent on mobile.

## Azure deployment

- Azure App Service (Linux, Node 20, standalone) + Azure SQL + Key Vault +
  Application Insights, and (where available) Azure OpenAI + Azure Maps behind a
  provider abstraction. Infra in `infra/main.bicep`; CI/CD in `.github/workflows`
  (OIDC, no credentials in the repo). Reuse existing resources first.

## Testing requirements

- Unit-test pure logic and security: WhatsApp/AI parsing, analytics + PR
  detection, authorization (coach mutation = 403), password hashing, and gym
  exploration maths (unique visited / active total). Run `npm run lint`,
  `npm run typecheck`, and `npm test` before considering work complete.

