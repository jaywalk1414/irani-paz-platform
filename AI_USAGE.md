## 1. Tools and their roles

Three tools were used, each with a different responsibility. Keeping them
separate reduced the risk of one model's blind spots leaking into another's
work.

| Tool | Primary role | Typical use |
| --- | --- | --- |
| **GPT** | Brainstorming and overall architecture | Shaping the domain model, arguing about trade-offs, drafting `SCOPE.md` sections, planning the order and availability services before writing code |
| **Claude** | Bug detection and code review | Reviewing drafted services, catching auth/tenant boundary mistakes, spotting transaction leaks and stale-session bugs, correcting SQL semantics |
| **DeepSeek** | Development and code generation | Writing the bulk of the service, action, and UI code, generating the seed script, scaffolding the schema |

In practice: GPT shaped the *what* and *why*, DeepSeek produced the *how*, and
Claude audited the result before it was committed.

---

## 2. Where the tools saved real time

### DeepSeek — bulk code generation

The highest-leverage use was generating the repetitive but delicate code
that sits between the UI and the database:

- **The seed script** (`src/lib/db/seed.ts`) — 400+ lines of deterministic
  fixture generation across eleven tables, including the RNG, Tehran time
  arithmetic, historical orders, and the koobideh adjustment record. Writing
  this by hand would have taken 60–90 minutes; the generated version took
  ~10 minutes to review and correct.
- **The kitchen board** (`KitchenBoard.tsx`) — a polling client component
  with per-item actions, urgency computation, and a cancel dialog. Structurally
  boring, easy to get wrong; the first draft was ~80 % usable.
- **The owner availability board** — `useActionState` form per item with
  optimistic state display, again tedious rather than clever.

### GPT — architecture conversations

- Drafting the three-quantity model discussion that led to `DECISIONS.md §6`.
- Arguing through the “do we need NestJS?” question and landing on the
  single Next.js codebase.
- Producing the first version of the preparation-estimate model (parallel vs
  sequential prep groups) before any code existed.

The saving here was not typing but **exploration**: I could argue ten
permutations of the availability model in twenty minutes and only write one
of them into the schema.

### Claude — review passes that actually caught bugs

The most valuable single use of any tool in this project was Claude reviewing
the drafted `order.service.ts`. It caught:

- A **transaction leak**: the drafted `submitOrder` opened a transaction,
  then called `getBusinessContext()` (which uses the shared `db` client, not
  the transaction handle) *inside* the transaction body. Under Neon serverless
  that pattern can deadlock the pool. The fix was to move the business-context
  read outside the transaction — a one-line change that would have been a
  production incident if it shipped.
- The **`orders.idempotency_key` design flaw** described in §4 below.

### Rough time accounting (six-hour assessment budget)

| Activity | Without AI (estimate) | Actual with AI |
| --- | --- | --- |
| Seed script | 90 min | 25 min (10 min generation + 15 min review and fixes) |
| Order service | 120 min | 75 min |
| Kitchen board | 90 min | 45 min |
| Owner dashboard + availability board | 120 min | 60 min |
| Auth wiring | 60 min | 40 min |
| CI + deployment | 60 min | 30 min |

Not a day job’s worth of savings, but the hours recovered were spent on the
parts the assessment actually scores: the concurrency guarantees, the tenant
isolation, and the test coverage of those two things.

---

## 3. Where the tools produced something bad

Three distinct failure modes, each with a concrete example.

### 3.1 Confident but wrong

**GPT suggested `SSE` for the kitchen board real-time updates** as the
default, without flagging that Vercel serverless functions are a poor fit for
long-lived connections. That recommendation would have shipped as the
implementation if I hadn't stopped to think through the deployment target.
The correct answer for this stack is short-interval polling; SSE remains a
*possible* upgrade if the runtime changes, which is exactly how `DECISIONS.md
§5` now records it.

**GPT also included `shadcn/ui` in the initial stack table.** No justification
was ever given for it. For a login form, three dashboards, and one ordering
flow, plain Tailwind was faster to write and easier for a reviewer to
inspect. Dropped, and documented as a correction in `DECISIONS.md §12` item 8.

### 3.2 Plausible but subtly broken

**DeepSeek's first draft of the idempotency design** placed
`idempotency_key` on the `orders` table and checked it before insert. That
works for *order creation* but is structurally wrong for *appending items to
an existing table order* — the append path reuses the order row, so the
original key no longer applies, and a retry of the append would double-insert
the new items. This is the failure mode documented in `DECISIONS.md §12` item
11. Fix was a dedicated `order_submissions(restaurant_id, idempotency_key)`
table; the original column was kept only as an audit field.

**DeepSeek's first draft of the `daily_availability` table** stored an
`available_quantity` column alongside `configured_quantity` and
`reserved_quantity`. Three numbers that must always satisfy
`available = configured - reserved` is three numbers that can drift. The fix
was to **remove the column and compute the value on read**, which is what
shipped. `DECISIONS.md §6` now calls this out explicitly.

### 3.3 Correct but stale

**Claude's middleware advice was correct for Next.js 14 and obsolete by
Next.js 16.** It suggested keeping role gating in middleware in the first
review pass; by the time we actually ran `next dev`, Next.js was warning that
`middleware` had been renamed to `proxy`, and the Edge-runtime limitation
(custom JWT claims unavailable) made the original advice moot anyway. The
final architecture — basic auth in `proxy.ts`, role gating in per-role
layouts and `requireRole()` — was assembled from a combination of Claude's
security instincts and Next.js's current documentation, not from any single
recommendation.

The takeaway from these three: **generated code is a draft, and the draft
must be reviewed against the *runtime* it will run on, not just against
whether it looks reasonable.**

---

## 4. One recommendation I rejected, and why

**DeepSeek strongly recommended a separate NestJS backend with a React
frontend.**

The argument was standard: separation of concerns, dedicated API surface,
independent deployment, easier to scale the backend alone. On a project where
that mattered, it would be the right call. Here it was wrong, and I rejected
it for four specific reasons:

1. **It would have consumed the assessment budget on infrastructure.** Two
   deployments, two sets of environment variables, CORS configuration, a
   duplicated auth layer, and a build pipeline that has to coordinate two
   services — easily two hours of the six-hour budget before any business
   logic exists.
2. **It doesn't demonstrate anything the assessment is scored on.** The
   quality of this MVP lives in the atomic reservation, the tenant isolation,
   the snapshot discipline, and the tests around those. Splitting the codebase
   into two services changes none of those four things.
3. **Next.js already provides the separation.** `lib/services/*` is the
   backend layer. Server Actions and Route Handlers are the API surface.
   React components never touch the database. That is a clean boundary; the
   number of running processes is not what defines it.
4. **Extraction later is cheap.** If the product grows into mobile clients or
   background workers, the service layer is already the extraction seam. That
   is precisely why `DECISIONS.md §1` records it as a deliberate consequence
   rather than a limitation.

This rejection is also recorded in `DECISIONS.md §12` item 1, because a
reviewer seeing only the final architecture would not know it was considered
and discarded.

---

## 5. How generated code was verified

Five layers, applied in this order. No generated code was committed without
at least passing through the first three.

### 5.1 TypeScript and lint

- `npx tsc --noEmit` — every change.
- `npm run lint` — every change.
- The Auth.js type augmentation in `types/next-auth.d.ts` was written by
  hand, because DeepSeek kept producing code that used `session.user.role`
  without declaring it, and TypeScript was the only thing catching that.

### 5.2 Reading the SQL, not the Drizzle

The single most important review habit on this project was **reading the raw
SQL that Drizzle generates** for anything touching availability, because the
correctness of the whole system rests on one conditional `UPDATE`. Every
generation of `reserveQuantity` was verified with `drizzle-kit studio` (or a
`db.execute(sql\`EXPLAIN ANALYZE …\`)` against a scratch database) to confirm:

- The `WHERE` clause included `configured_quantity - reserved_quantity >= $n`,
  not some other comparison.
- The `RETURNING` clause was present, so the service could distinguish
  “reserved 1 row” from “reserved 0 rows.”
- The `restaurant_id` and `menu_item_id` bindings were positional and correct.

DeepSeek's drafts repeatedly produced versions that were *almost* right — the
predicate was correct but the `RETURNING` was missing, or the predicate was
correct but the comparison used `>=` instead of `>`. None of those would have
failed a TypeScript check. All of them would have been a correctness bug in
production.

### 5.3 Integration tests against a real Postgres

Every service method that touches `daily_availability` was verified against
a live `postgres:17` in GitHub Actions (and later Neon). Unit-testing the
Drizzle query builder in isolation would not have caught the failures in
§5.2, because the query builder happily *runs* a semantically wrong query.

Tests cover:

- `ensureDayInitialized` is idempotent.
- `reserveQuantity` succeeds when `available >= qty`.
- `reserveQuantity` throws `InsufficientAvailabilityError` when `available < qty`.
- **Two concurrent `reserveQuantity` calls for the last portion: exactly one
  succeeds.** This is the test that closes the loop on `DECISIONS.md §6`, and
  it was written by hand, not generated.
- `releaseQuantity` clamps at zero on double release.
- `adjustQuantity` refuses to drop `configured` below `reserved`.
- `submitOrder` with the same `idempotencyKey` twice results in one order,
  one `order_submissions` row, and one set of reservations.
- `submitOrder` with a cross-tenant `tableId` fails with `TABLE_NOT_FOUND`.

### 5.4 Manual role smoke test

Three browser tabs (one per role), re-seeded database, walking the golden
path: waiter creates an order → kitchen starts and finishes items → waiter
sees ready → marks served. Run once after every change to the order service
or the seed. This is the test that caught the `Restaurant not found` stale-
session issue, because no automated test would have noticed a JWT pointing
at a truncated restaurant row.

### 5.5 Reading the generated code out loud

Not a metaphor: for anything involving auth, tenant boundaries, or the
idempotency logic, the code was read line-by-line as if explaining it to
someone else. Three bugs were found this way that neither types nor tests
flagged:

- A `getBusinessContext` call inside a transaction body (Claude caught it on
  review; the test would have hung, not failed cleanly).
- A role check that returned `null` on success instead of the user object
  (types were `User | null` so TypeScript was fine with it).
- The `updateMenuItemAction` cross-tenant guard that read the row, compared
  `restaurantId`, and then updated by `id` — correct, but only because the
  read happens in the same request before any write. Not obvious from the
  code alone.

---

## 6. What was my own thinking

This section exists because a reviewer seeing AI-generated code has no way to
know which decisions were made *with* the AI as a sounding board and which
were made *by* the AI as a default. The distinction matters.

These are decisions I made that no tool proposed, and in some cases that
tools argued against:

### 6.1 The three-quantity model

`configured_quantity` (owner-set starting stock), `reserved_quantity`
(committed by orders), `available_quantity` (**computed**, not stored). The
important part is not that availability is tracked — every design tracks
availability — it's that the third number is **derived** rather than stored,
so the invariant can't drift. This is what made the atomic reservation query
expressible as a single conditional `UPDATE` with no auxiliary state.

The AI consistently proposed storing all three. The correction is in
`DECISIONS.md §6` and in the mistake log (§12 item 9).

### 6.2 Lazy business-day initialization

The default AI answer for “reset availability daily” is a cron job, and on a
VPS that is the correct answer. On Vercel serverless it is the wrong answer
because there is no persistent process to schedule the job against.

The pattern that shipped — compute the business date from the restaurant’s
configured cutoff, then on first access `INSERT … ON CONFLICT DO NOTHING`
for that date — came from reading how Vercel Cron actually works (it fires
HTTP requests, not cron entries), deciding that tying the correctness of the
availability system to an external scheduler was fragile, and replacing it
with an idempotent write on the read path. `DECISIONS.md §6` records this as
a deliberate choice, not an implementation detail.

### 6.3 Per-submission idempotency

This is a correction *to* the AI design, made by running it and watching it
fail on the second run of `npm run db:seed`. The failure mode — double-append
on retry of an append submission — is only visible when you actually try the
workflow end to end. No amount of reading DeepSeek's draft of the order
service would have surfaced it, because the draft was internally consistent;
it was only wrong against the actual behavior of the app.

`DECISIONS.md §6` (under “Submission Idempotency”) and §12 item 11 both
record this.

### 6.4 The preparation-estimate model

The AI proposed three versions:

1. `SUM(prep_time_minutes)` across all items — obviously wrong, rejects the
   scope's worked example.
2. A full scheduler with capacity constraints — correct in theory, hours of
   work, out of scope for a six-hour MVP.
3. **The one that shipped**: per-item prep time plus a prep group, with
   parallel groups and a longest-remaining-path calculation.

The third version was assembled by rejecting (1) for being wrong and (2) for
being disproportionate, then finding the smallest model that produced the
right answer for the scope's example (a table with kebab in progress adding
a khoresh: the estimate should reflect the max of the two remaining times, not
the sum). `DECISIONS.md §7` records the model; the choice of *which* model to
build is mine.

### 6.5 The template fallback for the AI summary

`DECISIONS.md §9` requires the summary to be non-critical. The default AI
implementation was “call OpenAI, show the response.” The version that shipped
computes the aggregated stats first, renders a deterministic template from
those stats, and *then* attempts the AI call — falling back to the template
on failure and storing the result with `model: 'template'` so the fallback
is *visible* rather than disguised.

This is a small piece of work but a real design position: graceful
degradation should be inspectable, not silent.

### 6.6 The seed content

The Persian menu (names, descriptions, ingredients, table labels, user full
names, adjustment reason) is entirely hand-written. The AI generated the
structure and the RNG; the content is mine, because the SCOPE market is
“independent cafés and restaurants in Iran” and a demo with machine-
translated food is a worse demo than one with real Iranian dish names.

### 6.7 The middleware split

Basic auth in `proxy.ts`, role gating in per-role layouts and `requireRole()`.
The AI initially placed both in middleware. The split came from reading the
Next.js docs on Edge runtime limitations (custom JWT claims not available),
deciding that putting role logic in a place where the role field is absent
is a design smell even if it *happens* to work today, and moving the
authorization decision to where the full session is available.
`DECISIONS.md §12` item 12 records this.

---

## 7. Summary

- AI was used for **brainstorming** (GPT), **review** (Claude), and
  **generation** (DeepSeek).
- It saved real time on the seed, the UI plumbing, and the architecture
  conversations. It cost real time in the three places where its output had
  to be corrected after running against the actual runtime.
- The two most important corrections — per-submission idempotency and
  computed (not stored) availability — were found by **running the code**,
  not by reviewing the AI's reasoning.
- The core architecture (three-quantity model, lazy day initialization,
  parallel prep groups, template fallback, middleware split) was assembled
  from the AI's proposals by rejecting the ones that were wrong for this
  stack, and is recorded in `DECISIONS.md` with the reasoning made explicit.

The reviewer who wants to see where the AI stopped and the engineering
started should read `DECISIONS.md §6` (availability), §7 (estimation), and
§12 (correction log) alongside this file. The corrections in §12 are, in a
real sense, the most honest record of the process: each one is a place where
a tool's first answer was replaced by a better answer, and the file says so.