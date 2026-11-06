# DECISIONS.md

This document records the technical and product decisions made while building the restaurant operations SaaS MVP. It explains *why* each decision was made, what alternatives were considered, and what trade-offs or corrections were encountered. It is aligned with the confirmed scope in `SCOPE.md` and reflects the implemented state of the repository.

> **Hosting note:** The application is hosted with **GitHub + Vercel + Neon**. GitHub stores the source and runs CI, Vercel hosts the Next.js application, and Neon hosts the managed PostgreSQL database.

---

## 1. Tech Stack: Next.js Full-Stack + Drizzle + PostgreSQL

### Decision

Build the entire application as a single **Next.js (App Router)** codebase that handles UI, server-side rendering, Route Handlers, Server Actions, authentication, and database access. Use **Drizzle ORM** with **PostgreSQL** on **Neon**. UI is styled with **plain Tailwind**; no component library is used.

### Alternatives Considered

| Option | Why it was rejected |
| --- | --- |
| **NestJS backend + React frontend as separate services** | Adds deployment, authentication, API communication, and configuration overhead without improving this MVP. Two services to maintain and debug within a six-hour window. |
| **Firebase / Supabase as a full backend** | Less control over the domain model, tenant isolation, and transactional reservations. Managed abstractions hide the concurrency and authorization logic that demonstrate engineering quality. |
| **Next.js frontend + separate API server** | Still requires two deployments, CORS configuration, and duplicated auth logic. No clear benefit for a single-client, single-database product. |
| **VPS + Docker Compose** | Workable, but unnecessary operational overhead for a six-hour assessment. Vercel + Neon removes server administration while still demonstrating CI/CD. |
| **shadcn/ui component library** | Considered in planning. The MVP's UI surface (login, three dashboards, one ordering flow) is small enough that plain Tailwind primitives are faster to write and easier for a reviewer to inspect. Dropped during implementation (see §12). |

### Rationale

- **One deployable unit.** One repository, one Next.js application, one managed database. Development time stays focused on the domain model, transaction handling, authorization, preparation estimation, and tests.
- **Modular backend inside Next.js.** Business logic lives in `lib/services/` (`order.service.ts`, `availability.service.ts`, `estimate.service.ts`, `ai-summary.service.ts`) and is called by Server Actions or Route Handlers. React components do not contain business logic. This preserves separation of concerns without a second deployment.
- **Drizzle over Prisma/Kysely.** Drizzle stays close to SQL, which makes atomic reservations, conditional updates, and unique constraints explicit. The concurrency requirements in §6 are easier to reason about and test when the query builder mirrors SQL semantics.
- **Server-side database access only.** The browser never connects to PostgreSQL. All queries run in server-side code with authorization and tenant isolation enforced there.

### Consequences

- **Positive:** Fast iteration, single codebase, native Vercel deployment, managed PostgreSQL, preview deployments.
- **Negative:** If the product later needs mobile clients, external integrations, background workers, or independent API scaling, extracting a dedicated service will require work. The service layer is structured to make that extraction feasible.

---

## 2. Hosting Architecture: GitHub + Vercel + Neon

### Decision

| Layer | Provider | Responsibility |
| --- | --- | --- |
| Source control and CI | **GitHub** | Repository, pull requests, GitHub Actions checks |
| Application hosting | **Vercel** | Next.js builds, SSR, Server Actions, Route Handlers, preview and production deployments |
| Database | **Neon** | Managed PostgreSQL, connection pooling, backups, optional database branching |
| Deployment automation | **Vercel Git integration + GitHub Actions** | Vercel deploys from Git; GitHub Actions runs CI and production migration orchestration |

### Why not “everything on GitHub”?

GitHub can host source code and run CI/CD automation, but it does **not** provide general-purpose production hosting for a full-stack Next.js application or a production PostgreSQL database.

- **GitHub Pages** hosts static sites only.
- **GitHub Codespaces** is a development environment, not production hosting.
- **GitHub Actions** is automation, not a hosting provider.

### Deployment Architecture

```text
GitHub Repository
   │
   ├── GitHub Actions: typecheck, lint, tests (incl. E2E), migration job
   │
   ▼
Vercel: Next.js application (SSR, Route Handlers, Server Actions)
   │
   ▼
Neon: Managed PostgreSQL
```

### Neon-Specific Decisions

Pooled connection string for application queries. Vercel serverless functions create many short-lived connections; pooling is required.

Direct/unpooled connection string for migrations. `drizzle-kit migrate` runs from GitHub Actions, not from Vercel build steps.

Node.js runtime for database routes and Server Actions, not the Edge runtime, because interactive transactions are required for atomic reservations. All order and availability service code uses @neondatabase/serverless + ws for Pool-backed interactive transactions.

Preview deployments must not write to the production database. Preview deployments use a staging Neon database or branch.

Backups are Neon’s responsibility. Use Neon managed backups / point-in-time recovery rather than self-managed pg_dump cron jobs.

## 3. Multi-Tenancy and Data Isolation
### Decision
The MVP serves one restaurant branch operationally, but the schema and authorization model are multi-tenant from day one, as required by the scope (“platform foundation” and “restaurant-level data isolation on the backend”).

All core entities (users, menu_items, tables, orders, order_items, `daily_availability`, `availability_adjustments`, `order_submissions`) carry a `restaurant_id` (and where relevant `branch_id`).

Every server-side operation resolves the authenticated user’s `restaurant_id` from the session and constrains reads and writes to it.

Cross-restaurant access is treated as a security failure, not a validation error. Cross-tenant updates explicitly return “Item not found” rather than performing the write.

Tenant checks live in the service layer, not in UI conditionals. Services accept restaurantId as an explicit parameter so the boundary is visible at every entry point and testable without faking sessions.

### Rationale
The scope explicitly requires “Restaurant-level data isolation on the backend” and “Prevent users from modifying orders or menu data belonging to another restaurant.”

Retrofitting tenant boundaries after the fact is expensive and error-prone. Adding them now is cheap because the MVP is single-branch and the schema is still small.

Future multi-branch support reuses the same structure by adding `branch_id` constraints — no redesign required.

### Consequences
- **Positive:** Security boundary is enforced at the data layer; future multi-branch operation is additive.

- **Negative:** Slightly more boilerplate in queries and tests. Acceptable given the security requirement.

## 4. Authentication and Role-Based Access
### Decision
Single login page for all staff. After authentication, the user’s role determines the dashboard and navigation:

- Owner → restaurant dashboard, menu management, daily availability, adjustment history, AI daily summary.

- Waiter → tables, menu selection, order creation, order tracking.

- Kitchen → incoming orders, preparation status updates.

Authorization is enforced server-side. Navigating directly to a URL or calling an API endpoint does not bypass role checks.

Auth.js v5 (next-auth@beta) is used with the Credentials provider and JWT session strategy (required for Credentials). The JWT session carries { userId, restaurantId, branchId, role }. Every server-side operation re-checks role and tenant access against the database via `requireAuth` / `requireRole` / `requireTenant` helpers in lib/auth/require.ts.

Passwords are hashed with bcryptjs at cost 10. Pure-JS was chosen over argon2 to avoid native binaries in CI and on Vercel; cost 10 is adequate for a demo with documented credentials.

Middleware scope is deliberately limited to basic authentication (redirect to /login if not signed in). Role gating lives in per-role layouts and in the `requireRole`() server helper. Rationale: the Edge runtime only exposes the default session fields to middleware; custom JWT fields like role are not available there, so role checks belong where the full session is.

Secrets are stored in Vercel environment variables and GitHub Actions secrets, never in the repository.

### Waiter Ordering Flow
Prominent New Order CTA opens a guided workflow:

- Select table (with current status).

- Select menu items (prices, ingredients, availability, preparation time).

- Configure quantities and special instructions.

- Review (items, total, server-computed readiness estimate).

- Confirm — validate availability, reserve quantities atomically, submit to kitchen.

The table context stays visible throughout. Waiters add multiple items before reviewing. Adding items to an existing table order does not create a duplicate table order. If an item becomes unavailable mid-order, confirmation is blocked with an explanation.

### Rationale
One login page avoids duplicated auth UI without any security cost; role-based authorization is the security boundary.

Splitting middleware from role checks keeps the Edge bundle small and puts the authorization decision where the full session is available.

The ordering flow is mobile/tablet-first because speed during service is a product requirement (SCOPE §5.2, §8).

## 5. Data Fetching, Mutations, and Live Updates
### Decision
| Operation type | Approach |
| --- | --- |
| Initial dashboard, menu, table data | React Server Components querying PostgreSQL directly |
| Order creation, availability changes, status updates | Server Actions or Route Handlers calling the service layer |
| Waiter ordering flow refresh | Client-side poll of `/api/waiter/availability` every 6 s while on the menu and review steps |
| Kitchen board refresh | Client-side poll of `/api/kitchen/orders` every 5 s |
| Waiter order detail refresh | Relies on server-side `revalidatePath` triggered by kitchen actions; no dedicated poll in this iteration |
### Rationale
Scope requires updates without manual refresh. The scope says menu changes “will be reflected in the waiter interface without requiring a manual refresh” and the kitchen interface “will update without requiring a full page reload.” Polling satisfies both: the client automatically refreshes data on an interval, and the user never has to press refresh or navigate away.

SSR alone is not real-time synchronization. Two waiters loading the menu concurrently can see stale availability. The database remains the source of truth; the client refresh mechanism only communicates changes after they are committed.

Polling is the pragmatic choice on Vercel. Vercel serverless functions have execution time limits and are not designed for long-lived SSE/WebSocket connections. Reliable polling keeps the demo robust within the six-hour budget.

Polling is not a correctness mechanism. Concurrency correctness is enforced in the database (§6). Polling is only how the UI catches up.

The waiter detail page relies on revalidation rather than its own poll. Kitchen status changes call `revalidatePath`('/waiter/orders') and `revalidatePath`('/waiter/dashboard'), so navigation reflects the latest state. Adding a dedicated detail-page poll is a one-file change if needed later; it is deliberately cut for scope.

### Caching Rules
Explicitly configure Next.js caching; do not assume server-rendered requests are fresh.

Menu descriptions, restaurant settings — cacheable.

Menu prices — refreshed when changed.

Daily availability — must be fresh.

Active order status — must be fresh.

Kitchen preparation status — must be fresh.

### Consequences
- **Positive:** Simple, robust, works within Vercel constraints, satisfies the “no manual refresh” requirement.

- **Negative:** Updates are near-real-time (seconds) rather than instant. If the runtime later supports long-lived connections or a dedicated real-time service is added, SSE or WebSockets can replace polling without changing the service layer.

## 6. Concurrency, Daily Availability, and Submission Idempotency
### Decision
Track availability at the menu-item level for the MVP, not ingredient-level inventory (as confirmed in SCOPE §6.4 and §10). Maintain three distinct quantities:

- Configured daily quantity (`daily_availability`.`configured_quantity`) — the starting stock set by the owner.

- Reserved quantity (`daily_availability`.`reserved_quantity`) — portions committed by confirmed orders.

- Remaining available quantity — computed as `configured_quantity` - `reserved_quantity`. It is not stored.

Reservations happen atomically in the database, in the same transaction that creates the order, via a single conditional UPDATE:

```sql
UPDATE `daily_availability`
SET `reserved_quantity` = `reserved_quantity` + $1,
    updated_at = now()
WHERE `restaurant_id` = $2
  AND menu_item_id = $3
  AND business_date = $4::date
  AND `configured_quantity` - `reserved_quantity` >= $1
RETURNING id, `configured_quantity`, `reserved_quantity`;
```

If RETURNING is empty, the reservation failed and the order is rejected with a specific message that names the requested and available quantities. The service re-reads the row to explain why the failure occurred (missing item vs. out of stock).

The UPDATE is the only writer of `reserved_quantity` during normal operation; the only other writer is `releaseQuantity`, which runs when a kitchen item is cancelled and is clamped at 0.

### Owner Adjustments and Audit
Owners can increase or decrease `configured_quantity` during the day (SCOPE §6.4).

Adjustments run in their own transaction using SELECT … FOR UPDATE on the row so concurrent adjustments serialize, followed by an invariant check (newConfigured >= `reserved_quantity`) and the update.

Every adjustment is written to `availability_adjustments` (who, when, item, previous → new, delta, reason) in the same transaction as the row update.

Manual adjustments never bypass the invariants above.

### Business-Day Initialization
Daily availability resets according to the restaurant’s configured business day, not midnight. Because Vercel is serverless, the app does not rely on a per-restaurant long-running scheduler:

The current business date is computed from restaurants.timezone and restaurants.business_day_cutoff at read time.

On first availability read or order attempt for that business date, `ensureDayInitialized` runs a INSERT … ON CONFLICT (menu_item_id, business_date) DO NOTHING to lazily seed the day’s rows from each active menu item’s daily_quantity_default.

Initialization is idempotent, enforced by the unique constraint on (menu_item_id, business_date). menu_item_id already implies a restaurant through its foreign key, so `restaurant_id` is not part of the constraint.

`ensureDayInitialized` is called inside the same transaction as `reserveQuantity`, so the row always exists before the conditional UPDATE.

A Vercel Cron job may be added later for pre-warming, but correctness does not depend on it.

### Submission Idempotency (`order_submissions`)
The original plan placed `idempotency_key` on orders. That only deduplicates order creation. When a waiter appends items to an existing table order, that is a separate submission and needs its own idempotency key — otherwise a retry would append the same items twice.

The implemented solution introduces a dedicated `order_submissions` table:

```sql
CREATE TABLE `order_submissions` (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  `restaurant_id` uuid NOT NULL,
  `idempotency_key` text NOT NULL,
  order_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (`restaurant_id`, `idempotency_key`),
  ...
);
```

`submitOrder` checks `order_submissions` first. A hit returns the current state of the referenced order (reported as wasIdempotentReplay: true) without touching reservations. A miss runs the full submission and inserts one `order_submissions` row in the same transaction.

orders.`idempotency_key` is retained as the audit key of the submission that created the order.

### Rationale
SSR alone cannot prevent overselling. Two waiters can see “1 portion remaining” and both attempt to order it. Only the database can arbitrate (SCOPE §2, §11).

Atomic conditional UPDATE guarantees the available quantity cannot be exceeded under concurrent requests, and the RETURNING clause gives the service enough information to fail loudly and informatively.

Computing available instead of storing it removes any possibility of the three quantities going out of sync. There is exactly one source of truth for the invariant.

Lazy initialization is serverless-friendly and correct across multiple function instances.

Per-submission idempotency matches the real workflow (waiter submits, retries, or appends) rather than the simpler assumption that every order is created exactly once.

The database is the source of truth. Polling or notifications are communication mechanisms, not correctness mechanisms.

### Consequences
- **Positive:** Correctness under concurrency is enforced at the lowest layer; UI can fail gracefully with an explanatory message; adjustment history is auditable; retries are safe across create and append paths.

- **Negative:** Ingredient-level inventory is out of scope for the MVP (deliberate, per SCOPE §10). The `order_submissions` table is a small amount of additional schema; the simplification of not having it would have re-introduced a double-append bug on retries.

## 7. Preparation Time and Order Readiness Estimation
### Decision
Each menu item has a restaurant-defined preparation duration. Order readiness is calculated by the system using:

- Preparation requirements of individual items.

- The current preparation progress of existing items.

- Newly ordered items.

- Relationships between items that can be prepared in parallel vs. sequentially.

The estimate represents when the complete order is expected to be ready — not a naive sum of every item’s duration.

### Model
Each menu item has a `prep_time_minutes` and a prep group (grill, fryer, stew_rice, cold, beverage, other). Items in different groups run in parallel; items in the same group share a station and run sequentially.

For an order, the readiness estimate is computed as the longest remaining path across prep groups:

For each group, remaining_work = Σ(remaining prep of in-progress items) + Σ(prep of pending items) for items in that group.

remaining prep is 0 for ready/cancelled, prep_time - elapsed(started_at) for preparing, and full prep_time for pending.

estimate = now + max(remaining_work across groups).

The estimate is recomputed on three events: item added to order, item status change (pending → preparing → ready), and item cancellation.

`previewOrderEstimate` exposes the same calculation to the waiter review step so the readiness shown before submission is identical to the one the order will carry after submission. It combines the table’s existing active-order lines with the tentative cart lines; it makes no reservations.

This is intentionally a simple, explainable model — a constraint class per item plus a longest-path calculation — rather than a full kitchen scheduling optimizer, which SCOPE §10 explicitly excludes.

### Rationale
The scope’s worked example is exactly this: a table has kebab in progress, the customer adds khoresh, and the revised estimate reflects the remaining kebab time and the khoresh time running in parallel with constraints.

A naive SUM(prep_time) overstates readiness and would make waiters promise unrealistic times (SCOPE §2).

Showing the same estimate in review as in the order avoids “the number changes when I confirm” surprises.

Keeping the model explainable and deterministic makes it unit-testable and demoable.

### Consequences
- **Positive:** Estimates behave correctly for the scope’s example, are recomputable as kitchen status changes, are previewable before submission, and are unit-testable.

- **Negative:** Not a capacity-optimizing scheduler. Documented as a known limitation (SCOPE §10). The service (estimate.service.ts) is isolated so the algorithm can be replaced later without touching UI or API layers.

## 8. Historical Data and Order Snapshots
### Decision
Order records preserve the information applicable at confirmation time (SCOPE §6.2, §7):

order_items store a snapshot of the item name (name_snapshot), unit price (unit_price_toman_snapshot), description (description_snapshot), prep time (`prep_time_minutes`_snapshot), and prep group (prep_group_snapshot) as they were when the order was confirmed.

Later menu edits do not alter historical orders.

Prices are stored as integers in Iranian toman (no floating-point currency).

Order and order-item records keep timestamps (confirmed_at, started_at, ready_at, served_at, cancelled_at) and status history (`order_status_history`) sufficient for future reporting (SCOPE §7), even though advanced reporting is out of scope.

### Rationale
Menu prices change due to ingredient cost and currency fluctuations (SCOPE §2). Historical orders must not silently change when the menu changes.

Integer toman avoids floating-point rounding errors in a currency where fractions are not used.

Status history enables later reporting on preparation durations and service times without re-deriving them from mutable columns.

### Consequences
- **Positive:** Historical consistency is guaranteed by construction; later reporting can rely on snapshot columns.

- **Negative:** Slight storage duplication; acceptable for correctness.

## 9. AI Daily Service Summary (Optional, Non-Critical)
### Decision
Include an optional AI-generated daily service summary (SCOPE §9). Implementation details:

On-demand generation. The dashboard renders immediately with the cached summary (or a “generate” prompt). Generation is a button, not a page-load side effect. The owner is not blocked by a 5 s AI call on every refresh.

Payload is a small, PII-free aggregation produced by `aggregateDailyStats`: order count, revenue, portion count, top 5 item names with quantities, top 3 busy hour windows, and yesterday’s totals for comparison. No customer data, no order IDs, no staff names.

Template fallback produces a deterministic summary from the same aggregated stats when the AI call fails, times out (5 s), or is not configured. The fallback is stored with model = 'template' so a reviewer can see which path ran.

The summary is cached in `ai_daily_summaries` keyed by (`restaurant_id`, business_date) and can be regenerated later in the day via the same action.

The summary is informational only. It never modifies orders, prices, or availability.

If the AI provider is unavailable, the core workflow continues normally. Only the summary card’s content falls back to the template; nothing else in the app depends on it.

### Rationale
SCOPE §8 requires that “the core ordering workflow remains operational if the AI provider is unavailable,” and §9 confirms the summary is optional.

Isolating the AI feature behind its own service, its own cache table, and its own UI card keeps the critical path independent of an external provider.

Storing the fallback with model = 'template' makes the graceful degradation visible rather than disguised.

### Consequences
- **Positive:** Demonstrates an AI feature without compromising reliability; easy to remove or extend; the AI never receives more data than the deterministic template would use.

- **Negative:** One more external dependency and secret to manage. Contained by the availability-isolated design.

## 10. CI/CD: GitHub Actions + Vercel + Neon
### Decision
Use GitHub Actions for CI and Vercel Git integration for CD, with a GitHub Actions migration job for production database changes.

### CI — on pull requests and pushes to main
npm ci

TypeScript check: tsc --noEmit

Lint

Unit and integration tests against a temporary PostgreSQL service in GitHub Actions

Automated end-to-end test covering the core waiter → kitchen workflow (SCOPE §11 success criterion)

Production build check

Vercel also builds preview deployments for pull requests. Preview deployments use non-production environment variables and must not write to the production Neon database.

### CD — on push to main
GitHub Actions runs the same CI checks.

A migration job runs `drizzle-kit migrate` against production Neon using the direct (unpooled) connection string, from GitHub Actions secrets.

Vercel deploys the Next.js application from main.

Migrations are written to be backward-compatible so deployment order between migration and rollout does not cause downtime.

Health endpoint (`/api/health`) is checked after deployment.

Vercel build steps must not run production migrations. Builds run multiple times, including for previews, and must remain side-effect-free with respect to the production database.

### Seed Data and Demo Credentials
The repository includes realistic seed data (SCOPE §13): a restaurant with a menu spanning fast food, kebab, and Iranian dishes (koobideh, joojeh, barg, ghormeh sabzi, gheymeh, fesenjan, fries, fried chicken, pizza, shirazi salad, mast-o-khiar, doogh, coke), eight tables, four users (owner, two waiters, kitchen), two active orders (one preparing, one pending), two days of historical orders, today’s availability, and one owner adjustment for the audit view.

Demo credentials are documented in README.md for owner, waiter, and kitchen roles (owner@demo.local, waiter@demo.local, waiter2@demo.local, kitchen@demo.local, password demo1234) so the evaluator can exercise the workflow immediately.

### Migration Discipline
Expand/contract migrations: add first, deploy application, remove later.

Never run destructive migrations or resets automatically.

Pin third-party GitHub Actions to verified commit SHAs where practical.

### Rationale
Vercel is the natural CD target for Next.js and provides preview URLs for review.

GitHub Actions remains the place for tests (including E2E) and controlled migration execution.

Separating migrations from Vercel builds avoids accidental production schema changes during preview builds.

## 11. Operational Safeguards
Database backups: Neon managed backups / PITR. Independent of application deployment.

Secrets: Vercel environment variables for runtime; GitHub Actions secrets for CI and migrations. No secrets in the repository. AUTH_SECRET, `DATABASE_URL` (pooled), `DATABASE_URL`_DIRECT (migrations only), and AI_SUMMARY_API_* are all server-only.

Preview isolation: Preview deployments use a staging Neon database or branch, never production.

Connection management: Pooled Neon connection for app; direct connection for migrations.

Health check: `/api/health` verifies app and database connectivity after deployment.

No browser-side database access: All queries run server-side with authorization and tenant isolation.

Duplicate submission protection: `order_submissions`(`restaurant_id`, `idempotency_key`) unique constraint plus the `submitOrder` pre-check. The client generates an idempotency key with `crypto.randomUUID()` on entering the review step, reuses it on failure (so a network retry or double-tap dedupes cleanly against the same logical submission), and rotates it only after success (so the next logical submission — e.g., an append — is a distinct key).

Seed safety: db:seed refuses to run when `NODE_ENV=production` unless `ALLOW_SEED=true` is explicitly set. Prevents accidental truncation of a deployed database.

## 12. Correction / Mistake Log
These decisions or assumptions were revised during the project:

Initial assumption: a separate NestJS backend would be needed.
Revised — Next.js alone is sufficient for this MVP. The service layer provides modularity without a second deployment.

Initial hosting recommendation: VPS + Docker Compose + Nginx.
Revised — the actual deployment uses GitHub + Vercel + Neon. This removes server administration from the critical path while still demonstrating CI/CD and managed database operations.

Initial real-time recommendation: SSE.
Revised — Vercel serverless functions are not a good fit for long-lived SSE connections. The MVP uses short-interval polling, which still satisfies the scope’s “without requiring a manual refresh / full page reload” requirement. SSE/WebSockets remain a future option if the runtime changes.

Initial framing of daily quantity as “remaining stock.”
Corrected — the configured daily quantity is the starting stock. If the owner sets 30 portions and 12 are ordered, the system shows 18 remaining. The three-quantity model makes this unambiguous.

Initial assumption of a midnight reset.
Corrected — the reset follows the restaurant’s configured business day, not midnight.

“Can everything live on GitHub?”
Clarified — source code and CI can, but production hosting and a production PostgreSQL database cannot. GitHub Pages and Codespaces are not substitutes. Vercel hosts the app; Neon hosts the database.

Naive preparation estimate (SUM(prep_time)).
Revised — readiness uses a parallel/sequential constraint model and a longest-remaining-path calculation, matching the scope’s worked example.

shadcn/ui was in the planning stack.
Dropped — plain Tailwind primitives were faster to write and easier for a reviewer to inspect for this UI surface. The summary table reflects the actual stack.

Schema naming: menu_`daily_availability` → `daily_availability`.
The original SQL sketch used menu_`daily_availability` and an available_quantity column. Implementation dropped the menu_ prefix and removed the stored available_quantity column entirely; the available count is computed from `configured_quantity` - `reserved_quantity`. This removes any chance of the three quantities drifting out of sync.

Unique constraint on `daily_availability` simplified from (`restaurant_id`, menu_item_id, business_date) to (menu_item_id, business_date).
Since menu_item_id already belongs to exactly one restaurant via its foreign key, the extra `restaurant_id` was redundant. The simpler constraint is still sufficient for idempotent lazy initialization.

Idempotency moved from orders.`idempotency_key` to a dedicated `order_submissions` table.
Discovered during the order service implementation: a single key on orders only deduplicates order creation. Appending items to an existing table order is a distinct submission that also needs retry safety. `order_submissions`(`restaurant_id`, `idempotency_key`) handles both paths; orders.`idempotency_key` is kept as an audit column.

Middleware scope reduced to basic authentication.
The Edge runtime only exposes default session fields, so custom JWT fields like role are unavailable there. Role gating moved to per-role layouts and `requireRole`(). This is the Auth.js recommended pattern and it keeps the Edge bundle free of Drizzle and bcrypt.

AI summary generates on demand, not on page load, and stores a deterministic fallback.
Considered generating on every dashboard visit; changed to on-demand with a cached template fallback so the dashboard is never blocked by a 5 s AI call and the “AI unavailable” path is visible (model = 'template') rather than disguised.

Waiter review step shows a preview estimate.
`previewOrderEstimate` was added after the estimate service to remove the “the number changes after I confirm” surprise. It combines the active-order lines with the tentative cart and makes no reservations.

### Summary Table
| Concern | Choice |
| Source control | GitHub |
| CI | GitHub Actions (typecheck, lint, tests, E2E, build) |
| Application hosting | Vercel |
| Database hosting | Neon (managed PostgreSQL) |
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind (plain; no component library) |
| ORM | Drizzle |
| Database driver | @neondatabase/serverless + ws (interactive transactions) |
| Authentication | Auth.js v5 Credentials + JWT session; bcryptjs hashes; server-side  |
`requireRole`
 checks
| Middleware | Basic auth only; role gating in layouts and services |
| Validation | Zod |
| Multi-tenancy | `restaurant_id` on all entities; enforced in service layer via explicit parameter |
| Live updates | Short-interval polling: kitchen 5 s, waiter availability 6 s; order detail via `revalidatePath` |
| Concurrency control | Atomic conditional UPDATE … WHERE configured - reserved >= n + RETURNING |
| Daily availability | Three quantities (configured stored, reserved stored, available computed); lazy business-day init via ON CONFLICT DO NOTHING; SELECT … FOR UPDATE for adjustments |
| Submission idempotency | `order_submissions`(`restaurant_id`, `idempotency_key`); client rotates on success, reuses on failure |
| Preparation estimates | Per-item prep time + prep group + longest-remaining-path; previewed in review step |
| Historical orders | Snapshot of name, toman price, description, prep time, prep group at confirmation; `order_status_history` |
| Prices | Integer Iranian toman |
| AI summary | Optional, on-demand, cached per business day, template fallback stored as model = 'template'; app fully functional without it |
| Migrations | drizzle-kit from GitHub Actions (never from Vercel build); backward-compatible only |
| Database connections | Pooled Neon connection for app; direct connection for migrations |
| Preview environments | Vercel previews + staging Neon database/branch; never production DB |
| Backups | Neon managed backups / PITR |
| Seed data / demo creds | Included in repo and README for all three roles; db:seed refuses to run in production without `ALLOW_SEED=true` |
