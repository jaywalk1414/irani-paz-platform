# Restaurant Operations Platform

A multi-tenant restaurant operations SaaS for independent cafés and restaurants
in Iran. The MVP delivers one complete operational workflow — waiter → kitchen
→ served — with particular attention to shared menu availability, atomic
reservations, and preparation-time coordination.

This is not a demo skeleton. It runs end-to-end against a real PostgreSQL
database, includes concurrency tests, and enforces restaurant-level data
isolation on every query.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Quick start (local)](#2-quick-start-local)
3. [Demo credentials](#3-demo-credentials)
4. [Architecture overview](#4-architecture-overview)
5. [Data model](#5-data-model)
6. [Key design decisions](#6-key-design-decisions)
7. [Testing](#7-testing)
8. [Deployment](#8-deployment)
9. [Scripts reference](#9-scripts-reference)
10. [Where to read next](#10-where-to-read-next)

---

## 1. What it does

Three roles, one login page, role-appropriate dashboards:

- **Owner** — dashboard with today's KPIs, menu management (create/edit/
  deactivate), daily availability with an auditable adjustment history, and
  an optional AI daily summary.
- **Waiter** — table grid, guided ordering flow (table → menu → review →
  confirm), live availability polling, order detail with readiness estimate,
  and item-append support that does not duplicate the table order.
- **Kitchen** — polling board of active orders, per-item Start / Ready /
  Cancel, urgency indicators (fresh / due / late), and a live counter.

The two behavioral properties the MVP is designed around:

- **Two waiters cannot sell the same last portion of a dish.** Availability
  is enforced by a single atomic conditional `UPDATE` on the database.
- **Historical orders do not change when the menu changes.** Order items
  store snapshots of the item name, price, description, prep time, and prep
  group at confirmation time.

Full scope in `SCOPE.md`. Design rationale in `DECISIONS.md`. How AI was used
in `AI_USAGE.md`. What the owner should know in `HANDOVER.md`.

---

## 2. Quick start (local)

### 2.1 Prerequisites

- **Node.js 20+** (`node --version`)
- **npm** (ships with Node)
- A **PostgreSQL database**. You can use:
  - A local PostgreSQL 16 or 17 instance, or
  - A free [Neon](https://neon.tech) project (recommended; matches production)

### 2.2 Clone and install

```bash
git clone <your-repo-url> restaurant-platform
cd restaurant-platform
npm ci