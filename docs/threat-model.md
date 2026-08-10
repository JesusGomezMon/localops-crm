# Threat model — STRIDE

Scoped to what exists in this repository. Every mitigation marked ✅ points at code
that is committed and, where noted, covered by a test. Nothing here is aspirational —
gaps are listed as gaps.

## Assets worth protecting

1. **Customer PII** — name, phone, email for every person who has ever booked.
2. **Business figures** — revenue, booking volume, membership sales.
3. **The calendar** — an attacker who fills it denies the business its day.
4. **The Stripe secret key** — spend authority on the business's account.

## Trust boundaries

```
internet ──▶ [public booking]  anonymous, rate limited, no session
internet ──▶ [staff panel]     session required … but no credential proves identity
   app    ──▶ [Stripe API]     server-side, secret key from env
   app    ──▶ [SQLite]         same host, no network exposure
```

---

## S — Spoofing

| # | Threat | Mitigation | Status |
|---|---|---|---|
| S1 | **Anyone who knows a staff email signs in as staff.** No password, no link, no verification. | None. `authorize()` in `auth.ts` looks the address up and returns the user. | ❌ **CRITICAL — top finding** |
| S2 | Attacker brute-forces staff addresses against the sign-in endpoint | No limiter on `/api/auth/*`; the public booking limiter does not cover it | ❌ |
| S3 | Attacker forges a session token | JWT signed with `AUTH_SECRET`; claims read with type guards in `auth.config.ts` | ✅ |
| S4 | Attacker enumerates which addresses are staff | Login shows a distinct "not registered" error | ⚠️ |
| S5 | Visitor impersonates another customer when booking | Not applicable — booking is anonymous by design; there is no customer identity to steal | ✅ n/a |

**S1 is the finding that matters.** Every "staff-only" control in this document
assumes the staff boundary means something. Today it means "knows an email address".

---

## T — Tampering

| # | Threat | Mitigation | Status |
|---|---|---|---|
| T1 | **Client submits its own total** to pay less than the basket is worth | No schema accepts an amount. `computeTotalCents()` runs server-side over rows just read from the database. `.strict()` turns a smuggled `totalCents` into a 422. | ✅ tested |
| T2 | **Package id passed in the `extraIds` array** to assemble an underpriced basket | Extras re-read with `kind: "extra"` enforced; anything else 404s the whole request | ✅ tested |
| T3 | **Regular-tier service booked into the VIP-only branch** by hand-crafted request | `isAvailableAtBranch()` runs server-side on booking, on availability, and in the staff walk-in action | ✅ tested |
| T4 | Booking a slot that was never offered — past, outside hours, already taken | Availability re-derived server-side on submission | ✅ tested |
| T5 | Stripe redirect pointed at an attacker's site | `origin` taken from the request URL, never the body | ✅ |
| T6 | SQL injection through booking or auth input | Prisma parameterises everything; `$queryRaw` appears nowhere in `app/`, `lib/` or `tests/` | ✅ |
| T7 | Corrupt branch opening hours make a branch bookable around the clock | `parseOpeningHours()` fails closed — unparseable input yields no open days | ✅ tested |
| T8 | Staff move a booking to a branch that cannot perform it | Same tier check applies to the walk-in action | ✅ tested |

---

## R — Repudiation

| # | Threat | Mitigation | Status |
|---|---|---|---|
| R1 | Staff denies cancelling a booking | `AuditLog` table exists but **nothing writes to it** — the writer lived inside the removed tenant wrapper | ❌ |
| R2 | Customer denies making a booking | `source` records `public`/`kiosk`/`walkin`/`staff`; no IP or timestamp trail beyond `createdAt` | ⚠️ |
| R3 | Dispute over what a customer was charged | `Appointment.totalCents` stores the price agreed at booking time and is never recomputed | ✅ |
| R4 | No record of who signed in and when | No auth event logging | ❌ |

---

## I — Information disclosure

| # | Threat | Mitigation | Status |
|---|---|---|---|
| I1 | **Panel exposes every customer's name and phone to anyone who guesses a staff email** | Depends entirely on S1 | ❌ **critical, inherited** |
| I2 | Error responses confirm which record ids exist | Bare `{"error":"Not found"}`; a tier-blocked service and a nonexistent one return byte-identical responses | ✅ tested |
| I3 | Booked times leak as "taken" | Availability omits occupied slots entirely — a visitor is never told something exists at that hour | ✅ tested |
| I4 | Competitor measures a branch's load over time | Inherent to a public calendar; rate limited (60/min) rather than hidden | ⚠️ accepted |
| I5 | Stripe error bodies logged server-side may echo `customer_email` | Logged to stdout, not returned to the browser | ⚠️ |
| I6 | Card data stolen from this app | None is ever received — Stripe hosts the payment page | ✅ |

---

## D — Denial of service

| # | Threat | Mitigation | Status |
|---|---|---|---|
| D1 | Booking endpoint flooded from one source | Fixed-window per-IP limiter, 429 + `Retry-After` | ✅ tested |
| D2 | Same attacker rotates `x-forwarded-for` to bypass the limiter | Header trusted as given; needs a proxy that overwrites it | ❌ |
| D3 | Limiter is per-process, so N instances give N× the budget | In-memory `Map` | ❌ |
| D4 | Calendar filled with junk `pending` bookings that never expire | None — staff must cancel them by hand | ⚠️ |
| D5 | Sign-in endpoint flooded | No limiter | ❌ |

---

## E — Elevation of privilege

| # | Threat | Mitigation | Status |
|---|---|---|---|
| E1 | Anonymous visitor reaches staff routes | `requireStaff()` → 401; middleware redirects | ✅ |
| E2 | **A `staff` user performs owner-only actions** | `role` is stored and never read; every signed-in user can cancel bookings and activate memberships | ❌ |
| E3 | Visitor books into a branch tier they are not entitled to | Server-side tier check | ✅ tested |
| E4 | Weak default credential survives into production | Guard in `auth.ts` blocks a production build with no credential; must extend to a default password | ⚠️ |

---

## Findings, in priority order

| Rank | ID | Fix |
|---|---|---|
| 1 | **S1** | Require a password. Store a salted hash. This is the whole ballgame — I1 and D4's blast radius both collapse to it. |
| 2 | **S2, D5** | Rate limit sign-in per source. Reuse `checkRateLimit()`. |
| 3 | **E4** | Extend the production guard: refuse to boot on a known-default password, not just an absent one. |
| 4 | **S4** | Return one identical failure message whether the user is unknown or the password is wrong. |
| 5 | **E2** | Enforce `role` on destructive actions, or delete the column and stop implying it does something. |
| 6 | **R1, R4** | Reconnect audit writes; log sign-in events. |
| 7 | **P5**¹ | Stripe webhook to reconcile payment against the booking. |
| 8 | **D2, D3** | Shared rate-limit store; trusted-proxy IP resolution. |

¹ Tracked in `security-requirements.md` §4; not a STRIDE category but the largest
correctness gap in the payment path.

**Ranks 1–4 are auth work and are addressed in Phase 2.** Ranks 5–8 are logged here
deliberately rather than fixed silently.
