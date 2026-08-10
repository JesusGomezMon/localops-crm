# Security & privacy requirements

Scoped to what this repository actually is: a booking app for **one** business
(Kasterz, Cancún) with **two branches**, an anonymous public booking flow, a staff
panel, and Stripe Checkout. There is no client account system and no multi-tenancy —
both were removed.

Each requirement is marked with its status in the code today:
**✅ met** · **⚠️ partial** · **❌ not met**

---

## 1. Authentication

| # | Requirement | Status |
|---|---|---|
| A1 | The staff panel must require a secret only staff possess — knowing a username must not be sufficient | ❌ **not met**: sign-in accepts any known staff email with no credential. This is the highest-priority finding in the threat model. |
| A2 | Credentials must be stored as a salted one-way hash, never plaintext or reversible | ❌ no credential is stored at all |
| A3 | Failed sign-in attempts must be rate limited per source | ❌ no limiter on `/api/auth/*` |
| A4 | Sign-in must not reveal whether an account exists | ⚠️ the login page currently distinguishes "not registered" |
| A5 | Sessions must be signed, expire, and be invalidatable | ✅ JWT signed with `AUTH_SECRET`, Auth.js default expiry |
| A6 | Production must refuse to run with a known-weak or absent credential | ⚠️ a guard exists in `auth.ts` for the absent case; it must extend to a default password |

**Customers are deliberately anonymous.** Booking requires no account, so there is no
customer credential to protect. That is a design decision, not a gap: the less
authentication surface exposed to the public internet, the less there is to attack.

---

## 2. Authorization

| # | Requirement | Status |
|---|---|---|
| Z1 | Staff-only routes and actions must reject unauthenticated callers | ✅ `requireStaff()` throws → 401; middleware redirects `/dashboard/*` |
| Z2 | A VIP-only branch must not sell Regular-tier services or packages | ✅ `isAvailableAtBranch()`, enforced in UI, public API and staff action |
| Z3 | Branch enforcement must hold against hand-crafted requests, not only the UI | ✅ server-side on booking and availability; tested |
| Z4 | `owner` vs `staff` roles must gate destructive or financial actions | ❌ `role` is stored and never read |

---

## 3. Input validation & integrity

| # | Requirement | Status |
|---|---|---|
| I1 | Every request body and query string must be schema-validated before use | ✅ Zod, all schemas `.strict()` |
| I2 | Prices must be computed server-side from stored rows; a client-submitted total must be impossible | ✅ no schema accepts an amount; `computeTotalCents()` runs on server rows |
| I3 | Add-on ids must be verified to actually be add-ons | ✅ re-read with `kind: "extra"` enforced |
| I4 | Slot availability must be re-derived server-side on submission | ✅ the offered list is a convenience, not an authorisation |
| I5 | Database access must be parameterised — no string-built SQL | ✅ Prisma only; no `$queryRaw` anywhere |
| I6 | Malformed configuration must fail closed | ✅ `parseOpeningHours()` yields no open days on garbage |

---

## 4. Payment

| # | Requirement | Status |
|---|---|---|
| P1 | No card data may enter this application's storage or logs | ✅ Stripe hosts the payment page; only `externalRef` + URL stored |
| P2 | Payment amounts must come from the server, never the browser | ✅ line items built from database rows |
| P3 | Redirect URLs must not be attacker-controllable | ✅ `origin` read from the request, never the body |
| P4 | Secret keys must live only in the environment, never in the repo | ✅ `process.env.STRIPE_SECRET_KEY`, read at call time, never logged |
| P5 | Payment completion must be reconciled against the booking | ❌ **no webhook**; appointments stay `pending` whether or not payment succeeds |

---

## 5. Personal data

Collected: **name, phone, email** for customers; nothing else. No addresses, no
identity documents, no card data.

| # | Requirement | Status |
|---|---|---|
| D1 | Collect only what the booking needs | ✅ three fields |
| D2 | PII must never appear in error responses shown to other users | ✅ error bodies are bare (`{"error":"Not found"}`) |
| D3 | PII must not be written to application logs | ⚠️ unaudited; Stripe error bodies are logged server-side and may echo `customer_email` |
| D4 | Staff-facing PII must sit behind authentication | ⚠️ true structurally, but see A1 — the gate currently has no lock |
| D5 | There must be a route to delete a customer's record on request | ❌ no deletion path exists |
| D6 | Data at rest should be encrypted | ❌ SQLite file, unencrypted |

---

## 6. Availability & abuse

| # | Requirement | Status |
|---|---|---|
| V1 | The public booking endpoint must be rate limited per source | ✅ fixed-window, 429 + `Retry-After` |
| V2 | The availability endpoint must be rate limited | ✅ looser limit (60/min), it is a read |
| V3 | Rate limiting must survive multiple instances | ❌ in-memory, per-process |
| V4 | Client IP must be trustworthy | ⚠️ `x-forwarded-for` trusted as given; needs a trusted proxy in front |
| V5 | A visitor must not be able to occupy the calendar indefinitely | ⚠️ bookings are `pending` until staff act; no expiry sweeps them |

---

## 7. Operational

| # | Requirement | Status |
|---|---|---|
| O1 | Secrets must not be committed | ✅ `.env` gitignored; `.env.example` holds placeholders only |
| O2 | Dependencies must be audited on every build | ✅ `pnpm audit --audit-level high` in CI |
| O3 | Migrations must be reversible or provably non-destructive before running | ⚠️ practised manually; not enforced |
| O4 | The app must emit structured logs for incident reconstruction | ❌ ad-hoc `console.*` only |

---

## Priority order

1. **A1–A3** — the panel has no lock. Everything in §5 depends on this.
2. **P5** — payments are not reconciled; revenue figures can silently diverge from reality.
3. **Z4** — roles exist but do nothing.
4. **V3–V4** — rate limiting is defeatable by a header or a second instance.
5. **D5, D6, O4** — data lifecycle and observability.
