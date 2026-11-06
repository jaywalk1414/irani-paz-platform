# Restaurant Operations Platform

A multi-tenant restaurant operations SaaS built for independent cafés and restaurants in Iran.

The MVP covers the complete restaurant workflow — **waiter → kitchen → served** — with a focus on reliable order management, shared menu availability, atomic reservations, and preparation-time coordination.

Built with Next.js, TypeScript, and PostgreSQL, the platform includes role-based access, tenant isolation, transactional operations, and automated testing.

## Features

### Role-based dashboards

- **Owner:** Daily KPIs, menu management, availability control, adjustment history, and optional AI-generated daily summaries.
- **Waiter:** Table management, guided ordering, live availability, order tracking, and adding items to existing orders.
- **Kitchen:** Active order board, item-level status management, urgency indicators, and preparation tracking.

All roles use a single login page with automatic role-based redirection.

### Core capabilities

- Multi-tenant architecture with restaurant-level data isolation.
- Atomic inventory reservations to prevent overselling.
- Historical order snapshots that remain unchanged after menu edits.
- Idempotent order submissions to prevent duplicate orders.
- Preparation-time estimation based on parallel kitchen stations.
- Auditable daily availability adjustments.
- AI-generated daily summaries with deterministic fallback.
- Automated unit, integration, concurrency, and end-to-end tests.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL (Neon) |
| ORM | Drizzle ORM |
| Authentication | Auth.js v5, JWT, bcryptjs |
| Validation | Zod |
| Testing | Vitest, Playwright |
| CI/CD | GitHub Actions |
| Hosting | Vercel + Neon |

## Architecture

The application follows a modular monolithic architecture. Next.js handles the UI, server-side rendering, authentication, API routes, and server actions, while domain services encapsulate business logic and Drizzle manages database operations.

```text
Browser
   │
   ▼
Vercel / Next.js
   │
   ├── Proxy (basic authentication)
   │
   ├── Server Components
   │      └── Authentication & role checks
   │              └── Domain Services
   │                      └── Drizzle ORM
   │                              └── Neon PostgreSQL
   │
   ├── Server Actions
   │      ├── Role authorization
   │      ├── Zod validation
   │      ├── Database transactions
   │      └── Path revalidation
   │
   └── API Routes
          ├── Kitchen order polling
          └── Waiter availability polling
```

### Request lifecycle

**Read operations**

Server Components authenticate the user, verify their role, and call domain services to retrieve tenant-scoped data.

**Write operations**

Server Actions perform authorization and validation before executing transactional service operations. Successful mutations trigger relevant path revalidation.

**Live updates**

The kitchen board and waiter availability use periodic API polling (5–6 seconds). Polling was selected instead of WebSockets or SSE to remain compatible with Vercel's serverless execution model.

### Project structure

```text
restaurant-platform/
│
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── owner/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── menu/
│   │   │   │   └── availability/
│   │   │   │
│   │   │   ├── waiter/
│   │   │   │   ├── tables/
│   │   │   │   ├── ordering/
│   │   │   │   └── orders/
│   │   │   │
│   │   │   └── kitchen/
│   │   │       └── orders/
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── health/
│   │   │   ├── kitchen/
│   │   │   └── waiter/
│   │   │
│   │   ├── login/
│   │   ├── after-login/
│   │   └── page.tsx
│   │
│   ├── lib/
│   │   ├── auth/
│   │   │   └── require.ts
│   │   │
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── schema/
│   │   │   ├── seed.ts
│   │   │   └── load-env.ts
│   │   │
│   │   ├── services/
│   │   │   ├── availability.service.ts
│   │   │   ├── order.service.ts
│   │   │   ├── estimate.service.ts
│   │   │   ├── ai-summary.service.ts
│   │   │   └── errors.ts
│   │   │
│   │   ├── business-day.ts
│   │   └── routes.ts
│   │
│   └── proxy.ts
│
├── drizzle/                  # SQL migrations
├── .github/
│   └── workflows/            # CI/CD pipelines
│
├── auth.ts                   # Node-runtime authentication
├── auth.config.ts            # Edge-safe authentication config
├── drizzle.config.ts
├── package.json
├── SCOPE.md
├── DECISIONS.md
├── AI_USAGE.md
├── HANDOVER.md
└── README.md
```

*The tree highlights the main architectural areas; individual UI and component files are omitted.*

## Important Engineering Decisions

### 1. Multi-tenancy and authorization

Every business-level table is associated with a `restaurant_id`, with `branch_id` used where applicable.

All service queries explicitly receive the authenticated tenant ID. Cross-tenant access is treated as a security failure.

Shared authorization utilities include:

- `requireAuth()`
- `requireRole()`
- `requireTenant()`

### 2. Atomic availability reservations

Daily availability uses three values:

| Field | Purpose |
|---|---|
| `configured_quantity` | Initial daily stock configured by the owner |
| `reserved_quantity` | Quantity reserved by confirmed orders |
| `available_quantity` | Computed as configured minus reserved |

Reservations use a conditional database update:

```sql
UPDATE daily_availability
SET reserved_quantity = reserved_quantity + $1
WHERE restaurant_id = $2
  AND menu_item_id = $3
  AND business_date = $4::date
  AND configured_quantity - reserved_quantity >= $1
RETURNING id;
```

The database arbitrates concurrent reservations. If no row is returned, the transaction fails and rolls back.

### 3. Order snapshots and idempotency

Order items preserve menu information at confirmation time:

- Item name and description
- Unit price
- Preparation time
- Preparation group

Menu changes never modify historical orders.

A separate `order_submissions` table provides per-submission idempotency, protecting both new orders and additions to existing orders against duplicate retries.

### 4. Preparation-time estimation

Menu items belong to preparation groups such as grill, fryer, stew/rice, cold, and beverages.

- Items in the same group are prepared sequentially.
- Different groups operate in parallel.
- Estimated readiness is based on the longest remaining preparation path.

The estimate is recalculated when items are added, started, completed, or cancelled.

### 5. Authentication runtime separation

Authentication is split into two configurations:

- `auth.config.ts`: Edge-safe configuration without database access or bcrypt.
- `auth.ts`: Node-runtime configuration with Credentials authentication, bcrypt, and Drizzle.

The proxy handles basic authentication checks, while role authorization is enforced in server-side layouts and services.

### 6. Business-day initialization

Daily availability is initialized lazily using `ON CONFLICT DO NOTHING`, avoiding dependence on persistent background schedulers in a serverless environment.

## Data Model

The database contains the following main tables:

| Table | Responsibility |
|---|---|
| `restaurants` | Tenant root and business-day settings |
| `branches` | Restaurant branches |
| `users` | Owner, waiter, and kitchen accounts |
| `menu_items` | Menu and preparation configuration |
| `tables` | Restaurant seating |
| `daily_availability` | Daily inventory and reservations |
| `availability_adjustments` | Auditable stock changes |
| `orders` | Table orders |
| `order_submissions` | Submission idempotency |
| `order_items` | Order item snapshots and status |
| `order_status_history` | Order transition history |
| `ai_daily_summaries` | Cached daily summaries |

The schema also uses enums for roles, table status, order status, item status, and preparation groups.

## Local Development

### Requirements

- Node.js 20+
- npm
- PostgreSQL 16+ or Neon

### Installation

```bash
git clone <your-repo-url>
cd restaurant-platform
npm ci
```

### Environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure:

```env
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
DATABASE_URL_DIRECT="postgresql://user:pass@host/db?sslmode=require"
AUTH_SECRET="<generated-secret>"
AUTH_URL="http://localhost:3000"
```

Optional AI configuration:

```env
AI_SUMMARY_API_URL="https://api.openai.com/v1"
AI_SUMMARY_API_KEY="your-api-key"
AI_SUMMARY_MODEL="gpt-4o-mini"
```

Generate a secret with:

```bash
openssl rand -base64 32
```

**Neon connection note:** Use the pooled connection for `DATABASE_URL` and the direct connection for `DATABASE_URL_DIRECT`, which is used by migrations.

### Database setup

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The seed script creates a complete demo environment. It truncates business tables and refuses to run in production unless `ALLOW_SEED=true` is explicitly set.

### Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Accounts

Password for all accounts: `demo1234`

| Role | Email |
|---|---|
| Owner | owner@demo.local |
| Waiter | waiter@demo.local |
| Waiter 2 | waiter2@demo.local |
| Kitchen | kitchen@demo.local |

### Testing the concurrency guarantee

1. Open two browser sessions.
2. Sign in as `waiter@demo.local` and `waiter2@demo.local`.
3. Configure an item with only one available portion.
4. Attempt to order that portion from both sessions.

Exactly one reservation should succeed.

## Testing and CI/CD

The project uses three testing layers:

| Type | Coverage |
|---|---|
| Unit | Business-day logic and preparation estimates |
| Integration | Database services, tenant isolation, and transactions |
| E2E | Complete waiter → kitchen → served workflow |

Run tests:

```bash
npm test
npm run test:e2e
```

GitHub Actions validates every pull request and push to `main` through:

- TypeScript checks
- ESLint
- Unit and integration tests against PostgreSQL 17
- Production build
- Playwright E2E tests

### Deployment workflow

```text
Pull Request
    │
    ├── GitHub Actions CI
    └── Vercel Preview Deployment
             │
             ▼
        Merge to main
             │
             ├── GitHub Actions CI
             │
             ├── Database migrations
             │
             └── Vercel Production Deployment
```

Production migrations run through a dedicated GitHub Actions job after CI succeeds, not during Vercel builds.

Preview deployments must use a separate staging database rather than production.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript validation |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | Playwright tests |
| `npm run db:generate` | Generate migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Reset and seed demo data |

## Further Documentation

- **[SCOPE.md](./SCOPE.md)** — Product requirements and MVP boundaries.
- **[DECISIONS.md](./DECISIONS.md)** — Architectural decisions, alternatives, and trade-offs.
- **[AI_USAGE.md](./AI_USAGE.md)** — AI tools used during development and their contributions.
- **[HANDOVER.md](./HANDOVER.md)** — Implementation status, limitations, and next steps.

## License

Assessment project — not licensed for redistribution.