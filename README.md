# VioletX — AI Fitness Intelligence & Gym Exploration

**Train. Explore. Evolve.**

**VioletX** is a premium AI-powered personal fitness intelligence platform for
**one athlete and their coach**. The athlete — always shown as **Patient X**,
never by real name — records body measurements, strength progression and
training data, chats with the AI coach **Violet**, tracks nutrition, and explores
Anytime Fitness branches across Malaysia in an interactive **Gym Journey** map.
The **Coach** signs in with **strictly read-only** access.

A signature feature is **AI WhatsApp import**: Patient X pastes a WhatsApp
message and Violet interprets it into structured, confidence-scored records that
are reviewed and confirmed before saving — the AI never writes to the database
directly.

> The data model is designed so additional athletes could be supported later, but
> version 1 is optimised for a single Owner (Patient X) + Coach.

---

## Features

- 🤖 **Violet AI coach** — natural-language analysis; AI produces validated
  proposals, never raw SQL.
- 📥 **AI WhatsApp import** — paste a message, review confidence-scored records,
  confirm before saving.
- ⚖️ **Body measurements** — weight, waist, hip, chest, thigh, upper arm, custom.
- 🏋️ **Strength progression** — reps × weight per exercise; max-weight & rep PRs;
  estimated strength (Epley, clearly labelled).
- 🗺️ **Gym Journey** — explore Anytime Fitness Malaysia on an interactive map with
  an orange exploration radius and achievements.
- 🥗 **Nutrition** — optional logging and general nutrition guidance.
- 📈 **Trends & charts** — visualise change over time (Recharts, irregular dates).
- 👥 **Two roles** — Owner (Patient X, full CRUD + AI) and Coach (read-only,
  enforced server-side).
- 🔗 **Coach share link** — the Owner can create a read-only, expiring, revocable
  link (`/coach/<token>`) so a coach can view progress without signing in. Only a
  SHA-256 hash of the token is stored; notes and nutrition are never shared.

---

## VioletX V2 — personal fitness intelligence

V2 connects **plan → train → log → recover → analyse → adapt**. Everything below builds on the existing app;
no feature was removed or redesigned away, and historical data stays valid.

| Area | What you get | Page |
| --- | --- | --- |
| **Workouts** | Start a workout, log sets with large touch targets, previous performance, explainable targets, rest timer, PR celebration, session summary. State persists in Azure SQL so a refresh never loses a workout. | `/dashboard/workout`, `/dashboard/workouts` |
| **Programs** | PPL / Upper-Lower / Full body / custom; today's workout; create, edit, duplicate, archive; **Violet proposes programs** that you review and confirm. | `/dashboard/programs` |
| **Exercise library** | Aliases, primary/secondary muscles, equipment, movement pattern, instructions, custom exercises, personal history. | `/dashboard/exercises` |
| **Progress & analytics** | Weekly/monthly training, progress table, 7D–ALL analytics, muscle distribution, PR timeline, e1RM trends. | `/dashboard/progress`, `/dashboard/analytics`, `/dashboard/records` |
| **Goals** | Weight, waist, strength, weekly workouts, consistency, custom — with honest trajectories. | `/dashboard/goals` |
| **Recovery** | Quick daily check-in → readiness 0–100 and a non-medical explanation. | `/dashboard/recovery` |
| **Violet 2.0** | Grounded "How am I doing?" answers; weekly review with next-week proposals. | `/dashboard/coach`, `/dashboard/review` |
| **Nutrition** | Targets, daily progress, cautious trends (private to the athlete). | `/dashboard/nutrition` |
| **Gym Journey** | Workouts recorded at gyms count as visits; workouts by gym, favourite gym, achievements. | `/dashboard/gym` |
| **Coach** | Read-only dashboards and share link with goals, consistency, strength, workouts, readiness scores. | `/coach/<token>` |

Deep dives: [DATA-MODEL](docs/DATA-MODEL.md) · [WORKOUT-ENGINE](docs/WORKOUT-ENGINE.md) ·
[VIOLET-INTELLIGENCE](docs/VIOLET-INTELLIGENCE.md) · [AI-SAFETY](docs/AI-SAFETY.md) · [ROADMAP](docs/ROADMAP.md).
Prototype showcase: a read-only **demo account** with fictional history — see [DEMO-MODE](docs/DEMO-MODE.md).

### Implementation assessment (what V2 started from)
* **Existing:** DB-authenticated OWNER/COACH, measurements, body weight, set logging (`ExerciseEntry`), derived PRs,
  WhatsApp import with duplicate review, Violet interpreter, nutrition, Gym Journey, coach share link, Azure
  App Service + SQL + Key Vault + App Insights, OIDC deploy.
* **Reused:** the layered architecture (actions → services → repositories), Epley/PR helpers, Recharts wrappers,
  `WorkoutSession`, `GymVisit`, `ImportBatch`/`AIAction` audit pattern, share-link token model.
* **Missing:** live workout capture, programs, goals, recovery, analytics beyond trends, grounded AI answers.
* **Debt addressed:** server-run date handling (now athlete-timezone aware), unreliable DB resume (query retries),
  non-session-scoped coach data (session-free loaders for the token view).
* **Decision:** `ExerciseEntry` *is* the workout set (extended, not duplicated) so history is preserved; sessions
  gained a lifecycle instead of introducing a parallel table.

## Design & branding

The interface is a premium, minimal, futuristic and calm SaaS design inspired by
Apple Fitness/Health — with an industrial **safety-orange** primary on steel/graphite neutrals with a **rust**
accent used intentionally (VioletX identity, visited gyms, achievement,
progression), not everywhere. It favours generous whitespace, large rounded
cards, subtle borders/shadows, glass navigation, large metric typography, and a
mobile-first experience with a bottom navigation bar.

The **VioletX** app icon is an abstract orange-gradient **X** whose rising stroke
doubles as an upward progression line — rendered into favicon, Apple touch icon
and PWA sizes from a single SVG (see [`src/components/brand/logo.tsx`](src/components/brand/logo.tsx)
and [`scripts/gen-icons.mjs`](scripts/gen-icons.mjs)).

## Tech stack

| Layer            | Technology                                             |
| ---------------- | ------------------------------------------------------ |
| Framework        | Next.js (App Router) + React + TypeScript              |
| Styling / UI     | Tailwind CSS + shadcn/ui + Lucide icons                |
| Charts           | Recharts                                               |
| Animation        | Framer Motion                                          |
| Validation       | Zod                                                    |
| Data access      | Prisma ORM                                             |
| Database         | Azure SQL Database (`sqlserver` provider)              |
| Authentication   | Microsoft Entra ID via NextAuth                        |
| Hosting          | Azure App Service (Linux, Node)                        |
| Secrets          | Azure Key Vault (via managed identity)                 |
| CI/CD            | GitHub + GitHub Actions                                |

---

## Architecture

The app follows a layered architecture to keep business rules and access control
independent of the framework and the database:

```
 UI (App Router pages / client components, shadcn/ui, Recharts)
        │
        ▼
 Server Actions / Route Handlers  ──►  auth + role check (session)
        │
        ▼
 Service layer  (business rules, Zod validation, RBAC enforcement)
        │
        ▼
 Repository layer  (Prisma queries, no business logic)
        │
        ▼
 Prisma ORM  ──►  Azure SQL Database
```

- **RBAC** is enforced in the **service layer**, not just the UI. Coach sessions
  can only call read operations; any write throws before it reaches the database.
- **Zod** validates all input at the boundary (WhatsApp parser output, forms,
  route handlers).
- **Repositories** contain only data access; **services** hold the rules.
- **AI proposals:** Violet analyses data → returns a structured proposal → Zod
  validation → the athlete reviews/edits → explicit confirmation → service layer
  (RBAC) → repository → Azure SQL. AI never writes data or runs SQL
  ([AI-SAFETY](docs/AI-SAFETY.md)).
- **Workout lifecycle:** program template → today → start (targets copied) →
  active workout (sets persisted per ✓) → finish → analytics, goals, weekly
  review and Gym Journey update from the same recorded sets
  ([WORKOUT-ENGINE](docs/WORKOUT-ENGINE.md)).

### Project structure

```
src/
  app/                # Next.js App Router
    dashboard/        # authenticated pages (overview, weight, measurements,
                      #   strength, records, notes, import, settings)
    api/              # route handlers (auth, health)
    signin/           # sign-in page
  components/
    ui/               # shadcn/ui primitives
    dashboard/        # shell, sidebar, cards, delete button
    charts/           # Recharts wrappers
    weight|measurements|strength|notes|import|settings/  # feature components
  hooks/              # React hooks (use-toast)
  lib/
    auth.ts rbac.ts   # authentication + role-based access control
    schemas.ts        # Zod validation
    dto.ts            # DTO mappers (Decimal -> number)
    repositories/     # Prisma data access (athlete-scoped)
    services/         # business rules + RBAC enforcement
    actions/          # server actions ("use server")
    whatsapp-parser.ts# pure WhatsApp message parser
    secrets.ts        # Key Vault secret hydration
  instrumentation.ts  # server startup hook
  middleware.ts       # route protection (edge)
prisma/               # schema.prisma, migrations, seed
infra/                # Bicep infrastructure as code
.github/workflows/    # CI and deploy pipelines
```

## Testing

Vitest covers pure logic and security: workout/PR/overload engines, programs and
AI-proposal validation, goals, readiness, analytics, weekly review, Violet's
grounding guard, WhatsApp parsing/export, coach share links, RBAC (including a
cross-service "coach is read-only" table) and a full V2 lifecycle scenario.

```bash
npm run lint
npm run typecheck
npm test            # run once
npm run test:watch
npm run build
```

---

## Getting started (local development)

### Prerequisites

- Node.js 20+ (this repo is developed on Node 22)
- Access to a SQL Server / Azure SQL database
- A Microsoft Entra ID app registration (for sign-in)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, the `AZURE_AD_*` values, `NEXTAUTH_SECRET`, and
`OWNER_EMAIL`. See [`.env.example`](.env.example) for the full list.

### 3. Set up the database

```bash
npm run prisma:generate      # generate the Prisma client
npx prisma migrate dev       # create/apply migrations locally
npm run prisma:seed          # optional: seed baseline data
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

| Script                     | Purpose                              |
| -------------------------- | ------------------------------------ |
| `npm run dev`              | Start the dev server                 |
| `npm run build`            | Production build                     |
| `npm run start`            | Run the production build             |
| `npm run lint`             | ESLint                               |
| `npm run typecheck`        | TypeScript type checking             |
| `npm run prisma:generate`  | Generate the Prisma client           |
| `npm run prisma:migrate`   | Apply migrations (deploy)            |
| `npm run prisma:seed`      | Seed the database                    |

---

## Deployment (Azure)

The app deploys to **Azure App Service** (Linux, Node 20) as a Next.js
**standalone** build. Data lives in **Azure SQL Database**, secrets in **Azure
Key Vault**, and CI/CD runs in **GitHub Actions**.

Infrastructure is defined as code in [`infra/main.bicep`](infra/main.bicep):
Azure SQL server + database, Key Vault (with secrets), an App Service plan, and
a web app with a **system-assigned managed identity** that reads secrets from
Key Vault via Key Vault references. **Application Insights** (backed by a Log
Analytics workspace) captures request failures, API errors and exceptions; the
connection string is wired into App Service automatically. Imported WhatsApp
message contents are never sent to telemetry.

**V2 deployment notes:** no new Azure resources are required. The deploy workflow
applies the additive Prisma migrations (`0007`–`0010`) with `prisma migrate deploy`
*before* publishing the new build, so the schema is always ahead of the code. Optional
app setting `APP_TIMEZONE` (default `Asia/Kuala_Lumpur`) sets the athlete's "today";
Azure OpenAI (managed identity) is optional — every Violet feature has a
deterministic fallback. Transient database connection failures (e.g. serverless
resume) are retried automatically.

### 1. Register the Microsoft Entra ID application

1. In the Entra admin center, create an **App registration**.
2. Add a **Web** redirect URI: `https://<your-app>.azurewebsites.net/api/auth/callback/azure-ad`
   (and `http://localhost:3000/api/auth/callback/azure-ad` for local dev).
3. Create a **client secret**.
4. Note the **Application (client) ID**, **Directory (tenant) ID**, and secret.

### 2. Provision infrastructure

```bash
az group create -n progress-rg -l uksouth

az deployment group create -g progress-rg -f infra/main.bicep \
  -p infra/main.parameters.json \
  -p ownerEmail="athlete@example.com" \
     sqlAdminPassword="<StrongPassword>" \
     nextAuthSecret="$(openssl rand -base64 32)" \
     azureAdClientId="<client-id>" \
     azureAdClientSecret="<client-secret>" \
     azureAdTenantId="<tenant-id>"
```

The deployment outputs the web app name, URL, Key Vault name, SQL FQDN, and the
exact redirect URI to register in Entra.

### 3. Configure GitHub Actions

Add these repository secrets:

| Secret                  | Value                                              |
| ----------------------- | -------------------------------------------------- |
| `AZURE_CLIENT_ID`       | App registration (federated credential) client id  |
| `AZURE_TENANT_ID`       | Directory (tenant) id                               |
| `AZURE_SUBSCRIPTION_ID` | Subscription id                                     |
| `AZURE_WEBAPP_NAME`     | The App Service name from the deployment output     |
| `DATABASE_URL`          | Azure SQL connection string (for migrations)        |
| `NEXTAUTH_SECRET`       | Same secret used in the infra deployment            |

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, type-check,
  tests and build on every push/PR.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) authenticates to
  Azure with **OIDC (no stored credentials)**, runs `prisma migrate deploy`,
  builds the standalone bundle, and deploys to App Service on push to `main`.

### 4. Seed baseline data (first deploy)

Run once against the production database (or rely on the OWNER signing in, which
creates their user + athlete automatically):

```bash
DATABASE_URL="<azure-sql-connection-string>" npm run prisma:seed
```

### Secrets & Key Vault

- Production secrets are stored in **Key Vault** and surfaced to App Service as
  **Key Vault references** in application settings — no secrets in code or repo.
- As a complement, [`src/instrumentation.ts`](src/instrumentation.ts) can also
  hydrate secrets from Key Vault at startup using the managed identity (see
  [`src/lib/secrets.ts`](src/lib/secrets.ts)), for any value not already set.
- Local development uses a git-ignored `.env` (see [`.env.example`](.env.example)).

---

## Security & access control

- Coach access is **read-only and enforced on the server** (service layer + route
  handlers), not merely by hiding buttons.
- All write operations verify the session role is `OWNER` before executing.
- Input is validated with Zod before it reaches the database.
