# Handover — Restaurant Operations Platform

Written for the restaurant owner. Everything in this document is about what
the system does today, what it doesn't do yet, and what will happen as the
restaurant grows. If something is missing, it is named below rather than
left to be discovered on a busy Friday night.

---

## 1. What was delivered

This is a web application that your staff can open in any browser on a phone,
tablet, or computer. It replaces the paper notes and the WhatsApp group
between the dining room and the kitchen. It is one website with three
different views depending on who logs in.

**For the owner:**

- **A dashboard** that shows today's numbers the moment you log in: how many
  orders, how much revenue, how many portions sold, how many portions are
  still available across the whole menu.
- **A "what's running out" panel** that lists items that are sold out or
  down to three portions or fewer, so you can decide what to do about it
  before a waiter has to explain it to a table.
- **Top sellers today**, ordered by how many portions were ordered, so you
  can see what people are actually buying.
- **Busiest hours** for today, so you can see the peak window at a glance.
- **Menu management**, where you can add a new dish, change its price, change
  its preparation time, change its ingredients, or deactivate it — without
  calling anyone.
- **Daily availability**, where you set how many portions of each dish you
  have for today, and change that number during the day if the grill is
  running slow or if you want to push a dish before it goes to waste.
- **An adjustment history**, so every time a quantity is changed you can see
  who changed it, when, from what to what, and why — if the person wrote a
  reason. Nothing is silently adjusted.
- **An optional daily summary**, written in plain language, that gives you
  a short read on the day: top sellers, the busiest window, and how today
  compares to yesterday. This feature can be turned on or off; the rest of
  the app works fully without it. If the summary service is unavailable,
  you still get a written summary — just one assembled from today's numbers
  rather than by the AI.

**For the waiter:**

- **A table grid** showing every table, whether it's occupied, and — if it
  is — what stage the table's order is at (confirmed / preparing / ready to
  serve) and roughly when the order will be ready.
- **A guided ordering flow** that walks through picking the table, picking
  the items, adding special instructions, reviewing, and confirming. The
  table's name stays visible the whole time, so a waiter never loses track
  of which table they're ordering for.
- **The ability to add items to a table that already has an order** without
  creating a duplicate. The existing items stay in place; the new ones are
  added on top.
- **Live availability** — if a dish has been sold out by another waiter
  while the first waiter was still deciding, the first waiter sees that
  before they confirm, and the system will not let them promise a portion
  that isn't there.
- **Preparation progress** on each item and a revised ready-time estimate
  that updates as the kitchen works through the order.

**For the kitchen:**

- **A kitchen screen** that shows every incoming order in the order it
  arrived, grouped by table, with all the items, quantities, and any special
  instructions.
- **A green / yellow / red urgency indicator** on each item, so the kitchen
  can tell at a glance what needs attention and what is on time. Red is
  visibly pulsing.
- **Start / Ready / Cancel buttons** on each item individually, so a kitchen
  can start one dish while another is still being plated.
- **A live counter** at the top of pending / preparing / ready / late items
  across all orders, so the kitchen can see the shape of the shift at a
  glance.
- **Cancelling with a reason** so that if a customer changes their mind or
  an ingredient runs out, the order is corrected in place and the portion
  goes back into availability for another table.

**Cross-cutting things that matter to the owner:**

- **Every action is protected by role.** A waiter cannot see the owner
  screens, a kitchen cannot see pricing, and a staff member from another
  restaurant cannot see or change your data.
- **Historical orders do not change when the menu changes.** If you raise
  the price of koobideh tomorrow, yesterday's orders still show yesterday's
  price and yesterday's description. Your records stay accurate.
- **Two waiters cannot sell the same last portion of a dish.** The system
  blocks the second one and shows them a clear message explaining what
  happened.
- **Every confirmed order is saved the moment it is confirmed**, even if
  the browser crashes or the internet drops after that.

---

## 2. The main workflow, so their staff could start using it on Monday

This is what the first working day looks like. It assumes the login
accounts have been created (currently this needs the developer — see §3) and
that the menu has been entered correctly (which the owner can do, from the
Menu screen).

### Owner, Monday morning (10 minutes)

1. Log in as owner.
2. Open the **Menu** screen. Walk through every dish and confirm the price,
   preparation time, and ingredients are right. Fix any that aren't.
3. Open the **Availability** screen. Every dish appears with today's number
   pre-filled from the dish's default. Set today's numbers based on what
   the kitchen actually has prepared. This is what the waiters will see.
4. Close the laptop. The rest of the day, open the **Dashboard** whenever
   you want to see where the day is heading.

### Waiter, Monday lunch service

1. Log in on a phone or tablet.
2. The **Tables** screen shows all tables, colour-coded. Grey means nobody
   is sitting there. Amber means somebody is ordering. Green means the food
   is ready and waiting to be served.
3. A new table sits down at Table 3. The waiter taps **New Order**, taps
   **Table 3**, and the menu appears.
4. The waiter taps dishes to add them, adjusts quantities, and types a note
   if the customer asked for no onion. The total bill appears at the bottom
   of the screen continuously.
5. The waiter taps **Review**. The system shows the total, the items, and a
   realistic estimate of when the food will be ready. The estimate is
   calculated by the kitchen stations, not just added up — a kebab and a
   stew can be cooked in parallel, so the estimate reflects the slowest
   station, not the sum of every dish.
6. The waiter taps **Confirm**. From that moment the order is in the
   kitchen. If something sold out between opening the menu and tapping
   Confirm, the waiter sees exactly which item and how many portions are
   left, and can adjust before the kitchen ever sees it.
7. When the customer later wants to add a dessert, the waiter opens the
   table again from the **Tables** screen and taps **+ Add items**. The
   existing order is not duplicated; the new items sit on top of the old
   ones. The estimated ready time is recomputed to reflect both the new
   items and the progress the kitchen has already made.
8. When the kitchen has marked everything ready, the table turns green in
   the waiter's screen. The waiter delivers the food and taps **Mark as
   served**. The table becomes free for the next group.

### Kitchen, Monday lunch service

1. Log in on a tablet or a small screen placed near the pass.
2. The **Kitchen** screen shows every active order. New orders appear
   within about five seconds — no need to refresh the page.
3. When the kitchen starts prepping an item, tap **Start**. The item turns
   amber and a timer begins.
4. When the item is done, tap **Ready**. The item turns green. If every
   item on an order is now Ready, the whole order turns green and the
   waiter can serve it.
5. If an item runs past its promised preparation time, the item starts
   pulsing red and the top counter shows **Late**. Nobody has to notice
   this by looking at the clock; the screen tells them.
6. If something has to be cancelled — the customer changed their mind, an
   ingredient ran out — tap **Cancel** and type the reason. The reason
   appears on the item so the waiter and the owner can see it. The portion
   goes back into availability for another table.

That is the full loop. From a customer sitting down to the food being
served, every step is visible to the right person and every step is
recorded.

---

## 3. Known limitations, stated plainly

This is the most important section in this document. Everything below is
something the app does **not** do today, and the reason it is not there.

**People management is not in the app.**

- Adding a new waiter, changing a password, or removing someone who has
  left currently requires the developer to run a script. There is no
  screen for it. This is the highest-priority gap for a real restaurant,
  because it means every new hire has to go through a technical person.
- There is no "forgot password" flow. If a waiter forgets their password,
  someone with developer access has to reset it.
- There is no audit log of who logged in when. If a staff member leaves on
  bad terms, you cannot today see what they did on their last shift.

**The menu has no pictures.**

- Every dish currently shows its name, description, ingredients, price, and
  preparation time. No photograph. For a waiter taking an order next to
  the table this is acceptable; for a customer-facing menu it would not be.
- Adding photos is not a small change (it involves file storage), which is
  why it is not in this version.

**There is no checkout or payment.**

- The app tracks the order, but the bill is still settled through whatever
  you use today — a card reader, cash, or a separate POS. There is no "close
  the table" step that settles a payment.
- There is no receipt printing, no tax calculation, no split bill, no tip
  handling.

**There is no ingredient-level inventory.**

- Availability is tracked per finished dish. If you have four portions of
  koobideh, you have four portions; the system does not know or care how
  much minced beef is in the fridge.
- If you want to sell barg, the system cannot check whether there's enough
  filet in stock. You have to set barg's portion count yourself.
- This is a deliberate choice for the first version — ingredient tracking
  adds weeks of setup work per restaurant, and per-dish availability solves
  the immediate problem (two waiters promising the same last portion).

**There is no reporting beyond today.**

- The dashboard shows today only. There is no "this week" or "this month"
  or "compare last Friday to the Friday before."
- Historical orders are saved and could be reported on, but the reporting
  screens are not built yet.

**The preparation estimate is a schedule, not a simulation.**

- It accounts for what can be cooked in parallel and what has to be cooked
  in sequence. It reflects when the kitchen started each item.
- It does **not** account for how busy the kitchen is with other tables at
  the same moment. If the kitchen has fifteen orders in progress, the
  estimate shown to a customer will be optimistic. It will not be a lie, but
  it will not always be right on a busy Friday.
- The estimate updates as the kitchen progresses, so it corrects itself
  over time. But it cannot predict.

**The kitchen screen is a tablet or a computer browser, not a dedicated
display.**

- There is no "kitchen monitor mode" that mounts on a wall and stays logged
  in indefinitely. If the tablet's screen locks or the browser tab closes,
  the display stops updating until someone brings the tab back.
- The screen refreshes its data every few seconds. It is not truly
  real-time, in the way a live chat is real-time. Five seconds is the
  practical refresh window.

**The waiter's order detail screen is not auto-updating.**

- The order detail page a waiter opens after submitting reflects the state
  of the order at the moment they open it. When the kitchen marks an item
  ready, the waiter will see it the next time they navigate back to the
  page, or when the kitchen status reaches them through the Tables screen.
- The Tables screen updates continuously (every six seconds). The order
  detail page is more static.
- This is a deliberate simplification to save time, but it means a waiter
  who leaves the detail page open will not see the item go green in
  real-time.

**The AI daily summary is optional and informational.**

- It reads the day's numbers and writes two or three sentences about them.
- It never changes prices, availability, or orders. It cannot make
  recommendations that turn into actions on its own.
- If the AI service is down, a written summary still appears — assembled
  from today's numbers, not by the AI — so the owner always has something.

**There is one restaurant per login, and one branch.**

- The database is structured for multiple restaurants, but the screens you
  see are for your one restaurant and your one branch.
- If you open a second location tomorrow, the second location would need its
  own login accounts and its own menu, but there is no single screen that
  switches between branches.

**There are no notifications outside the app.**

- No SMS, no email, no push notification. Staff have to open the app to see
  what's happening.
- If a waiter's phone is off, the kitchen's order is still on the kitchen
  screen, but nobody gets pinged about it.

**Everything was built for a restaurant that closes at night.**

- The "business day" (the day the numbers reset) is configurable per
  restaurant. By default it rolls over at 4:00 in the morning, so a late
  dinner service isn't split across two days.
- It has not been tested for restaurants that operate 24 hours.

**If the developer re-runs the demo data setup, everything is wiped.**

- This only happens intentionally and only in development — the script
  refuses to run on the live system unless someone explicitly overrides
  that safety. It is mentioned here so nobody panics if they see it happen.

---

## 4. The next five things I would build, ranked

Ranked by what a restaurant owner would actually feel first. Every item
below is a real conversation that happens at the first monthly check-in.

### 1. Staff management screens

**Why:** Every restaurant hires and loses people. Today, adding a new
waiter requires the developer. On a Friday morning when a new hire shows up,
that is a problem. This is the single most likely reason the owner calls me
in the first month.

**What it looks like:** an "Staff" screen on the owner dashboard. Add a
person, set their role (waiter / kitchen / owner), set a temporary password,
deactivate when they leave. Password reset goes through the same screen.
Nothing fancy — but it unblocks real daily operations.

### 2. Simple historical reports

**Why:** The dashboard shows today only. The first thing an owner asks
after two weeks is "how did last week compare to the week before?" Without
that answer, the owner cannot make a decision about staffing, pricing, or
which dish is worth keeping.

**What it looks like:** a Reports screen with a week / month selector, a
table of top-selling dishes, a chart of orders by hour, and a comparison to
the same period last year or the previous period. All of this data is
already in the database; it is only the screens that are missing.

### 3. Kitchen display mode

**Why:** A kitchen should not have to keep a browser tab open and be
worried about the screen locking. Today, if the tablet screen sleeps, the
kitchen board stops updating silently. A restaurant owner will discover
this on the first busy night.

**What it looks like:** a "Kitchen mode" that turns the page into a
persistent, full-screen display, prevents the screen from sleeping, keeps
the tab awake, and reconnects automatically if the network drops for a few
seconds. Still the same page, but built to run for a whole shift.

### 4. Reopen and edit orders

**Why:** Staff make mistakes. A waiter hits Confirm before adding a
customer's dessert. A customer changes their order after the kitchen has
started. Today, the only way to fix this is to cancel the item and add it
again — which confuses the day's numbers and leaves a strange record in the
history.

**What it looks like:** a "Reopen order" button on the waiter's order
detail page, available while the order has not yet been served. Reopening
puts the order back into an editable state, with an audit trail of what was
changed. Nothing is silently overwritten.

### 5. Photo support for menu items

**Why:** When a customer asks "what does this look like?", a menu item with
a photograph ends the conversation faster than a menu item with a
description. On a busy night, faster is better. This is also the piece that
unlocks the possibility of a customer-facing menu later.

**What it looks like:** an upload button on each menu item. The photo
appears on the waiter's menu card and on the review step. Storage is
handled by a file service (Cloudinary or similar) so no infrastructure
lives on the restaurant's server.

---

## 5. Where this architecture breaks

The question is not "does this work today" — it does, for one restaurant
and one branch, comfortably. The question is "at what point does it stop
working, and what specifically is the first thing that fails."

The breaking points are named below at **10 restaurants**, **1,000
restaurants**, and **100,000 restaurants**. Each one is honest about what
actually stops first, not what would be nice to redesign.

### At 10 restaurants — this architecture is fine

Everything runs the same as today, on the same Vercel project and the same
Neon database. The only thing that changes is the number of logins and the
number of orders per day, both of which stay well within the range of what
one database and one Next.js deployment comfortably handle.

A single restaurant might do 30 to 100 orders per day. Ten restaurants do
300 to 1,000 orders per day. That is one-thousandth of what a single Neon
database is designed for. There is no scaling concern here at all.

The only small thing to notice is: **the availability of one restaurant is
already isolated from every other**, because every query is scoped to the
restaurant. So "one restaurant's slow day" cannot affect another restaurant.
That property does not change with scale.

### At 1,000 restaurants — polling becomes the first thing that hurts, not the database

The database is still fine. One-thousand restaurants at 100 orders per day
each is 100,000 orders per day. A well-indexed Postgres handles this without
breaking a sweat, especially on Neon with proper pooling.

What starts to hurt is the **polling**.

- The kitchen screen polls every 5 seconds. A busy restaurant might have
  two or three kitchen screens. That is roughly 35 polls per minute per
  restaurant.
- The waiter menu polls every 6 seconds while ordering. A busy restaurant
  might have ten waiters, and if half of them are mid-order at any moment,
  that is another 50 polls per minute per restaurant.
- Across 1,000 restaurants, that is 80,000 to 100,000 HTTP requests per
  minute to the same Next.js deployment, purely for polling. Not a failure,
  but a real cost line and a real bottleneck to plan around.

**The fix is to replace polling with push.** Server-Sent Events (a
one-way live connection from server to browser) or WebSockets (a two-way
connection) remove the need for the browser to ask again and again. The
database does not change; the "how does the UI find out" changes.

The second thing that starts to need work at 1,000 restaurants is **the AI
summary**. Today, the summary is generated on-demand and computed by
reading the day's orders. At 1,000 restaurants, if every owner generates the
summary at the same time in the evening, that is 1,000 aggregation queries
in a tight window. This needs to become a scheduled batch — one summary per
restaurant per day, computed by a background job, so the owner always
finds it ready instead of waiting.

### At 100,000 restaurants — the single-database, single-deployment model stops being appropriate

The database itself does not fail. Neon, tuned for this scale, can hold
this many restaurants' worth of orders. But the operational implications
of a **single shared database** for 100,000 restaurants become the wrong
trade-off:

- **Blast radius.** A migration with a mistake, a bad query from one
  restaurant's data, or a routine maintenance window now affects all
  100,000 restaurants at once. That is unacceptable at this scale. The
  right answer is to shard — each restaurant or group of restaurants gets
  its own database — so that one restaurant's incident is not a global
  incident.
- **The connection pool becomes a design problem, not a configuration
  problem.** Neon's pooled connections help enormously, but at 100,000
  restaurants the number of simultaneous serverless invocations requires
  careful partitioning of connections per region, per tenant group, or
  both.
- **The Next.js application itself.** A single Vercel deployment can be
  scaled, but a single codebase serving 100,000 restaurants means any
  deploy, any bad release, any configuration mistake affects everyone.
  The right answer is to split the application — at least between the
  owner-facing back-office and the staff-facing operational app — so that
  a bug in the reporting screens cannot take down the kitchen board.

**None of this means the current architecture was wrong.** The properties
that make it correct today — atomic reservations enforced by the database,
snapshots on order items, tenant isolation at every query — are exactly the
properties that make it survive to 1,000 restaurants. At 100,000, the
question is not "was this built right," it is "is a shared database still
the right shape." For a first product that has to reach 100,000 restaurants
before any of this matters, it is.

**The realistic sequence is:**

1. **0 – 50 restaurants:** no changes needed, at all.
2. **50 – 500 restaurants:** replace polling with SSE or WebSockets, move
   the AI summary to a scheduled batch.
3. **500 – 10,000 restaurants:** split the Next.js app into two deployments
   (owner / staff) so operational uptime and back-office uptime are
   independent; add proper connection pooling in front of Postgres.
4. **10,000 – 100,000 restaurants:** shard the database by restaurant or
   restaurant group; each shard is a small version of today's architecture.
5. **Beyond 100,000:** this is no longer a single-product question; it is a
   business decision about what the platform is willing to guarantee per
   restaurant, and the architecture should follow from that answer.

None of those steps requires throwing anything away. Each is an extension
or an extraction of what exists today.

---

## What to do on Monday

If you are the owner reading this and want to know what to actually do:

1. Confirm your staff logins exist. If you want to add or remove staff,
   that currently needs the developer — make a note of everyone who needs
   an account before the first shift.
2. Walk through the menu, correct every price, confirm every preparation
   time. These feed the readiness estimates; a wrong time is a wrong
   promise to a customer.
3. Set today's availability before lunch. It is okay if it is wrong —
   you can adjust it from the same screen during the day, and every
   adjustment is recorded.
4. Ask one waiter and one kitchen person to use the app for one shift
   while the others watch. The first shift is training, not measuring.

If something feels missing while you use it — a button you want, a number
you cannot see — write it down. Every item in §4 of this document came from
that same exercise. The version after this one exists to make the real
list of missing things shorter.