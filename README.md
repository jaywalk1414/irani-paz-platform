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
- AI-generated daily summaries with a deterministic fallback.
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

## Architecture Highlights

### Multi-tenancy and security

Every business-level query is scoped to the authenticated user's `restaurant_id`. Role-based authorization is enforced through shared authentication utilities and server-side checks.

### Atomic availability reservations

Inventory reservations use a conditional SQL `UPDATE` inside a database transaction.

This ensures that concurrent orders cannot reserve more portions than the configured daily quantity.

### Order integrity

Order items store snapshots of menu information at confirmation time, preserving historical prices, names, descriptions, and preparation details.

### Kitchen preparation estimates

Items are grouped by preparation station. Tasks within a station run sequentially, while different stations operate in parallel.

The estimated readiness time is calculated using the longest remaining preparation path.

### Live updates

The kitchen board and waiter availability use periodic API polling rather than persistent connections, keeping the architecture compatible with serverless hosting.

## Local Development

### Requirements

- Node.js 20+
- npm
- PostgreSQL 16+ or a Neon database

### Installation

```bash
git clone <your-repo-url>
cd restaurant-platform
npm ci
```

### Environment configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Configure the required variables:

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

The AI summary feature automatically falls back to a deterministic template when AI configuration is unavailable.

### Database setup

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Accounts

All accounts use the password:

`demo1234`

| Role | Email |
|---|---|
| Owner | owner@demo.local |
| Waiter | waiter@demo.local |
| Waiter 2 | waiter2@demo.local |
| Kitchen | kitchen@demo.local |

The seed script creates a complete demo environment with restaurant data, menu items, tables, users, active orders, and historical records.

**Note:** The seed script truncates business tables. It refuses to run in production unless explicitly authorized.

## Testing

The project includes multiple testing layers:

- **Unit tests:** Business-day calculations and preparation estimates.
- **Integration tests:** Database services, tenant isolation, and transactional behavior.
- **Concurrency tests:** Verify that only one simultaneous reservation succeeds for the last available portion.
- **E2E tests:** Validate the complete waiter-to-kitchen-to-served workflow using Playwright.

Run tests:

```bash
npm test
npm run test:e2e
```

### Continuous Integration

GitHub Actions runs the following checks on pull requests and pushes to `main`:

- TypeScript validation
- ESLint
- Unit and integration tests
- Production build
- Playwright end-to-end tests

Database migrations run through a dedicated GitHub Actions job after CI succeeds, keeping deployment builds free of production database side effects.

## Deployment

| Service | Responsibility |
|---|---|
| Vercel | Next.js application and preview deployments |
| Neon | Managed PostgreSQL database |
| GitHub Actions | CI, testing, and production migrations |

Preview deployments use a separate staging database. Production migrations run only after successful CI checks on `main`.

## Project Documentation

| File | Description |
|---|---|
| `SCOPE.md` | Product requirements and MVP boundaries |
| `DECISIONS.md` | Architecture decisions, alternatives, and trade-offs |
| `AI_USAGE.md` | AI tools used and their role in development |
| `HANDOVER.md` | Current implementation status, limitations, and next steps |

## License

Assessment project — not licensed for redistribution.