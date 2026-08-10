# Kasterz — reservas

Booking application for **Kasterz**, a men's grooming club in Cancún with two
branches. Customers book services, packages, extras and spa treatments; staff manage
the calendar from a panel.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Auth.js v5 ·
Prisma + SQLite · Zod · Vitest + Testing Library · pnpm · Node 20

---

## ⚠️ Read this before deploying

**The staff panel has no credential check.** Sign-in accepts any email address that
belongs to a staff user — no password, no emailed link, no verification. Anyone who
knows or guesses a staff address reaches the dashboard: revenue, customer names,
phone numbers, every booking.

This was removed deliberately, and the risk was raised before it was. A guard in
[`auth.ts`](auth.ts) refuses to start a production build unless
`ALLOW_PASSWORDLESS_ADMIN=yes-i-understand-the-risk` is set. That guard is the only
thing between this configuration and a real data leak.

**To restore authentication:** add a password field to `User` and compare a hash in
`authorize()` in [`auth.ts`](auth.ts). The session plumbing already works.

---

## Quick start

```bash
pnpm install
```

```bash
cp .env.example .env && pnpm prisma migrate deploy && pnpm db:seed
```

```bash
pnpm dev
```

- Public booking: `http://localhost:3000/book`
- Branch-pinned tablets: `/book?sucursal=Huayacan`, `/book?sucursal=PuertoCancun`
- Staff panel: `/login` with `owner@kasterz.test` — you are in immediately

---

## Branches are the only scoping axis

The app used to be multi-tenant, with a `tenantId` on every table and a query wrapper
that injected it. Kasterz is the only business, so that boundary had one side and was
removed.

**Branch scoping is a different axis and is fully intact:**

| Rule | Where |
|---|---|
| A VIP-only branch (Puerto Cancún) refuses Regular-tier services and packages | [`lib/catalog.ts`](lib/catalog.ts) — `isAvailableAtBranch()` |
| Each branch keeps its own calendar; two branches can hold the same hour | [`lib/availability.ts`](lib/availability.ts) — every query filters `branchId` |
| Each branch has its own opening hours, including different days | [`lib/opening-hours.ts`](lib/opening-hours.ts) |

`isAvailableAtBranch()` is called in **three** places — the booking UI, the public
booking endpoint, and the staff walk-in action — so the screen, the API and the panel
cannot disagree about what a branch sells.

---

## What still protects what

Only mitigations that exist in committed code.

| Threat | Mitigation | Test |
|---|---|---|
| A hand-crafted request books cheap Regular-tier work into the VIP-only branch | `isAvailableAtBranch()` runs server-side on booking and on availability | `public-booking.test.ts`, `catalog.test.ts` |
| A package id is passed in the extras array to assemble an underpriced basket | Extras are re-read with `kind: "extra"` enforced; anything else 404s the request | `public-booking.test.ts` |
| The client posts its own total | No schema accepts an amount. The total is computed server-side from rows just read from the database | `public-booking.test.ts` |
| Stripe's return URL is pointed at an attacker's site | `origin` comes from the request URL, never the body | — |
| A visitor books a slot that was never offered | Availability is re-derived server-side on every submission | `public-booking.test.ts` |
| A branch with corrupt opening hours accepts bookings for hours nobody works | `parseOpeningHours()` fails **closed** — no open days | `public-booking.test.ts` |
| Booked times leak as "taken" | The availability endpoint omits occupied slots entirely | `public-booking.test.ts` |
| Booking endpoint flooded from one source | Per-IP fixed-window limiter, 429 with `Retry-After` | `public-booking.test.ts` |
| Card data stolen from this app | No card data reaches it. Stripe hosts the payment page; only an opaque ref and URL are stored | — |
| Unauthenticated visitor reaches the panel | `requireStaff()` throws → 401; middleware redirects | — |

**What no longer protects anything:** the identity of whoever is signed in. See the
warning at the top.

---

## Known gaps

**Authentication**
- No password, no verification, no MFA. Covered above.
- `role` (`owner`/`staff`) is stored but never enforced — every signed-in user has
  full access.

**Payments**
- Stripe Checkout is wired through `fetch` against the REST API. No `stripe` package,
  no keys in the repository.
- **There is no webhook.** The appointment is created before payment completes and
  stays `pending` regardless. The session carries `metadata.appointmentId` ready for
  reconciliation.

**Memberships**
- `CustomerMembership` records who asked and who staff activated. Activating marks it
  sold for reporting only: no recurring charge, no visit counting, no access grant.
- Membership branch eligibility is read from the benefit copy (a tier saying "Solo
  sucursal Huayacán" is not pitched at Puerto Cancún). Rewording that line changes
  behaviour.

**Booking**
- Extras add price but not time; slot length comes from the primary service.
- Barbering durations are **working estimates** — kasterz.com publishes prices but not
  durations, except for massages. Confirm before go-live.
- `Branch.slug` is indexed, not unique.

**Staff panel**
- Walk-ins are ordinary appointments with `source: "walkin"`. A pure block (lunch,
  cleaning) must be entered as a booking with a name on it.
- Walk-ins without an email get a `presencial+…@sin-correo.local` placeholder.
- Form actions run from `<form action>`, which must return void, so a failed cancel is
  logged server-side rather than shown.

**Other**
- In-memory rate limiter: per-process, resets on restart, multiplies by instance count.
- `x-forwarded-for` is trusted as given.
- SQLite, no encryption at rest, no backups.

---

## Tests

```bash
pnpm test
```

54 tests across four files. The suite provisions its own SQLite database
(`prisma/test.db`) and resets it before every run.

- **`tests/catalog.test.ts`** — the branch tier filter, running totals, membership pitch
- **`tests/public-booking.test.ts`** — branch enforcement, separate calendars,
  per-branch hours, server-side pricing, rate limiting
- **`tests/dashboard.test.ts`** — walk-in blocking removes a slot, cancelling restores
  it, membership counts
- **`tests/booking-form.test.tsx`** — the rendered flow

```bash
pnpm lint && pnpm typecheck && pnpm build
```

---

## Project layout

```
lib/db.ts                  Plain Prisma client + requireStaff()
lib/catalog.ts             Branch tier filter, pricing, membership pitch
lib/availability.ts        Per-branch slot generation
lib/opening-hours.ts       Per-branch hours, fails closed
lib/booking.ts             Public booking surface
lib/reporting.ts           Dashboard figures
lib/stripe-checkout.ts     Stripe Checkout via REST
lib/rate-limit.ts          In-memory limiter
lib/validation.ts          Zod schemas, all .strict()

auth.ts                    ⚠️ Credential-free sign-in + production guard
middleware.ts              Session gate for /dashboard and staff APIs

app/book/                  Public booking — branch → service → extras → date → pay
app/dashboard/             Staff panel: metrics, agenda, walk-in blocking
```
