import {
  availabilityByDay,
  availableSlotsForDay,
  isSlotFree,
  isWithinBusinessHours,
} from "@/lib/availability";
import {
  computeTotalCents,
  isAvailableAtBranch,
  type CatalogItem,
} from "@/lib/catalog";
import { db } from "@/lib/db";
import { describeOpeningHours, parseOpeningHours } from "@/lib/opening-hours";
import {
  createStripeCheckoutSession,
  isStripeConfigured,
} from "@/lib/stripe-checkout";
import type {
  PublicBookingInput,
  PublicMembershipPurchaseInput,
} from "@/lib/validation";

/**
 * The public booking surface — everything an anonymous visitor can reach.
 *
 * This used to resolve a tenant slug before every query. Kasterz is the only business
 * now, so those lookups are gone.
 *
 * WHAT REMAINS, AND MUST: the branch rules. `branchId` and `serviceId` still arrive
 * from the visitor and are still validated against the database before use, and a
 * Regular-tier service is still refused at a VIP-only branch. Removing the tenant
 * boundary did not relax the branch boundary — see `isAvailableAtBranch`.
 */

export type PublicService = CatalogItem;

export type PublicBranch = {
  id: string;
  name: string;
  /** Deep-link key: /book?sucursal=PuertoCancun */
  slug: string | null;
  address: string | null;
  phone: string | null;
  vipOnly: boolean;
  amenities: string[];
  /** Pre-rendered lines like "Lun–Vie 09:00–22:00". */
  hours: string[];
};

export type PublicMembership = {
  id: string;
  name: string;
  priceCents: number;
  savingsCents: number | null;
  plans: string[];
  benefits: string[];
  highlight: boolean;
};

export type BookingPageData = {
  branches: PublicBranch[];
  services: PublicService[];
  memberships: PublicMembership[];
};

/** Parse a JSON string column into a string array, tolerating anything malformed. */
function stringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Everything the booking page needs on first paint: where the business operates, what
 * it sells, and what it charges for membership. Availability is deliberately NOT
 * included — the calendar fetches it per month, so the initial payload stays small.
 */
export async function getBookingPageData(): Promise<BookingPageData> {
  const [branches, services, memberships] = await Promise.all([
    db.branch.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        vipOnly: true,
        amenities: true,
        openingHours: true,
      },
      orderBy: { name: "asc" },
    }),
    db.service.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        category: true,
        tier: true,
        kind: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.membership.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        priceCents: true,
        savingsCents: true,
        plans: true,
        benefits: true,
        highlight: true,
      },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
    }),
  ]);

  return {
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      address: b.address,
      phone: b.phone,
      vipOnly: b.vipOnly,
      amenities: stringList(b.amenities),
      hours: describeOpeningHours(parseOpeningHours(b.openingHours)),
    })),
    services,
    memberships: memberships.map((m) => ({
      id: m.id,
      name: m.name,
      priceCents: m.priceCents,
      savingsCents: m.savingsCents,
      plans: stringList(m.plans),
      benefits: stringList(m.benefits),
      highlight: m.highlight,
    })),
  };
}

export type AvailabilityQuery = {
  branchId: string;
  serviceId: string;
  /** `YYYY-MM` for a month summary, or `YYYY-MM-DD` for one day's slots. */
  month?: string;
  date?: string;
};

export type AvailabilityResult =
  | { ok: true; mode: "month"; days: Record<string, number> }
  | { ok: true; mode: "day"; slots: string[] }
  | { ok: false; reason: "not_found" };

/**
 * Availability for the calendar.
 *
 * The branch and the service are re-read before any calendar data is computed, and a
 * service the branch does not offer is treated as nonexistent — so a visitor cannot
 * probe a VIP-only branch's schedule with a Regular-tier service id.
 */
export async function getAvailability(
  query: AvailabilityQuery,
): Promise<AvailabilityResult> {
  const [branch, service] = await Promise.all([
    db.branch.findFirst({
      where: { id: query.branchId, active: true },
      select: { id: true, openingHours: true, vipOnly: true },
    }),
    db.service.findFirst({
      where: { id: query.serviceId, active: true },
      select: { id: true, durationMin: true, tier: true },
    }),
  ]);

  if (!branch || !service) {
    return { ok: false, reason: "not_found" };
  }

  // A Regular-tier service at a VIP-only branch is not bookable, so it has no
  // calendar either. Same answer as a service that does not exist.
  if (!isAvailableAtBranch(service, branch)) {
    return { ok: false, reason: "not_found" };
  }

  const hours = parseOpeningHours(branch.openingHours);

  if (query.date) {
    const day = parseLocalDate(query.date);
    if (!day) {
      return { ok: false, reason: "not_found" };
    }

    const slots = await availableSlotsForDay(
      db,
      branch.id,
      hours,
      day,
      service.durationMin,
    );

    return { ok: true, mode: "day", slots: slots.map((s) => s.toISOString()) };
  }

  const monthStart = query.month ? parseLocalMonth(query.month) : new Date();
  if (!monthStart) {
    return { ok: false, reason: "not_found" };
  }

  const days = await availabilityByDay(
    db,
    branch.id,
    hours,
    monthStart,
    service.durationMin,
  );

  return { ok: true, mode: "month", days };
}

/** `YYYY-MM-DD` at local midnight. Avoids the UTC shift `new Date(str)` would apply. */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseLocalMonth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

export type BookingFailureReason =
  | "service_not_found"
  | "branch_not_found"
  | "slot_unavailable";

export type BookingResult =
  | {
      ok: true;
      booking: {
        id: string;
        startsAt: Date;
        status: string;
        totalCents: number;
      };
      /** Present only when Stripe is configured; the browser redirects here. */
      checkoutUrl: string | null;
    }
  | { ok: false; reason: BookingFailureReason };

export async function createPublicBooking(
  input: PublicBookingInput,
): Promise<BookingResult> {
  const [branch, service] = await Promise.all([
    db.branch.findFirst({
      where: { id: input.branchId, active: true },
      select: { id: true, name: true, openingHours: true, vipOnly: true },
    }),
    db.service.findFirst({
      where: { id: input.serviceId, active: true },
      select: {
        id: true,
        name: true,
        durationMin: true,
        priceCents: true,
        tier: true,
        kind: true,
      },
    }),
  ]);

  if (!branch) {
    return { ok: false, reason: "branch_not_found" };
  }
  if (!service) {
    return { ok: false, reason: "service_not_found" };
  }

  // THE server-side half of the branch filter. Hiding Regular-tier work in the UI
  // stops honest mistakes; this stops a hand-crafted request booking a $399 Básico
  // cut into the VIP-only branch.
  if (!isAvailableAtBranch(service, branch)) {
    return { ok: false, reason: "service_not_found" };
  }

  // Extras must genuinely be extras: passing a $1,399 package id in the extras array
  // would otherwise let someone assemble a booking the price never accounted for.
  const requestedExtraIds = [...new Set(input.extraIds ?? [])];
  const extras =
    requestedExtraIds.length > 0
      ? await db.service.findMany({
          where: { id: { in: requestedExtraIds }, active: true, kind: "extra" },
          select: { id: true, name: true, priceCents: true, tier: true },
        })
      : [];

  if (extras.length !== requestedExtraIds.length) {
    return { ok: false, reason: "service_not_found" };
  }

  // Availability is re-derived server-side against THIS branch's hours.
  if (input.startsAt.getTime() <= Date.now()) {
    return { ok: false, reason: "slot_unavailable" };
  }

  const hours = parseOpeningHours(branch.openingHours);

  if (!isWithinBusinessHours(hours, input.startsAt, service.durationMin)) {
    return { ok: false, reason: "slot_unavailable" };
  }

  if (!(await isSlotFree(db, branch.id, input.startsAt, service.durationMin))) {
    return { ok: false, reason: "slot_unavailable" };
  }

  const endsAt = new Date(
    input.startsAt.getTime() + service.durationMin * 60_000,
  );

  const existing = await db.customer.findFirst({
    where: { email: input.email },
    select: { id: true },
  });

  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        data: { name: input.name, phone: input.phone },
        select: { id: true },
      })
    : await db.customer.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
        },
        select: { id: true },
      });

  // Priced on the server from rows just read out of the database. The browser sends
  // ids, never amounts.
  const totalCents = computeTotalCents(service, extras);

  const appointment = await db.appointment.create({
    data: {
      branchId: branch.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: input.startsAt,
      endsAt,
      // Public bookings are requests, not commitments — staff confirm them.
      status: "pending",
      source: input.source === "kiosk" ? "kiosk" : "public",
      notes: input.notes,
      extraIds: JSON.stringify(extras.map((e) => e.id)),
      totalCents,
    },
    select: { id: true, startsAt: true, status: true, totalCents: true },
  });

  // The upsell's "Prefiero la membresía". Records a lead; charges nothing. A bad id
  // must not sink an otherwise-good booking, so it is logged, not thrown.
  if (input.membershipId) {
    const tier = await db.membership.findFirst({
      where: { id: input.membershipId, active: true },
      select: { id: true },
    });

    if (tier) {
      await db.customerMembership.create({
        data: {
          customerId: customer.id,
          membershipId: tier.id,
          status: "solicitada",
          quotedTotalCents: totalCents,
        },
        select: { id: true },
      });
    } else {
      console.warn("[booking] membership id did not resolve");
    }
  }

  const checkoutUrl = await startCheckout({
    appointmentId: appointment.id,
    branchName: branch.name,
    serviceName: service.name,
    extras,
    totalCents,
    customerEmail: input.email,
    origin: input.origin,
  });

  return { ok: true, booking: appointment, checkoutUrl };
}

/**
 * Hand the basket to Stripe and return the hosted payment URL.
 *
 * Returns null — rather than throwing — when Stripe is not configured, so a scaffold
 * without keys still completes a booking and simply says payment is pending.
 */
async function startCheckout(args: {
  appointmentId: string;
  branchName: string;
  serviceName: string;
  extras: Array<{ name: string; priceCents: number }>;
  totalCents: number;
  customerEmail: string;
  origin: string;
}): Promise<string | null> {
  if (!isStripeConfigured()) {
    console.warn(
      "[checkout] STRIPE_SECRET_KEY not set — appointment recorded, payment skipped.",
    );
    return null;
  }

  const base = `${args.origin}/book`;

  const session = await createStripeCheckoutSession({
    currency: "mxn",
    customerEmail: args.customerEmail,
    successUrl: `${base}?reserva=${args.appointmentId}&pago=ok`,
    cancelUrl: `${base}?reserva=${args.appointmentId}&pago=cancelado`,
    lineItems: [
      {
        name: `${args.serviceName} — ${args.branchName}`,
        amountCents: args.totalCents - args.extras.reduce((s, e) => s + e.priceCents, 0),
        quantity: 1,
      },
      ...args.extras.map((e) => ({
        name: e.name,
        amountCents: e.priceCents,
        quantity: 1,
      })),
    ],
    metadata: { appointmentId: args.appointmentId },
  });

  return session.url;
}

export type MembershipPurchaseResult =
  | {
      ok: true;
      requestId: string;
      membershipName: string;
      priceCents: number;
      checkoutUrl: string | null;
    }
  | { ok: false; reason: "membership_not_found" };

/**
 * Charge (or record) a membership purchase from the public site.
 *
 * Price is read from the tier row — the body only carries identity and which tier.
 * Without Stripe the lead is still stored so staff can close it in branch.
 */
export async function purchaseMembership(
  input: PublicMembershipPurchaseInput,
): Promise<MembershipPurchaseResult> {
  const tier = await db.membership.findFirst({
    where: { id: input.membershipId, active: true },
    select: { id: true, name: true, priceCents: true },
  });

  if (!tier) {
    return { ok: false, reason: "membership_not_found" };
  }

  const existing = await db.customer.findFirst({
    where: { email: input.email },
    select: { id: true },
  });

  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        data: { name: input.name, phone: input.phone },
        select: { id: true },
      })
    : await db.customer.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
        },
        select: { id: true },
      });

  const request = await db.customerMembership.create({
    data: {
      customerId: customer.id,
      membershipId: tier.id,
      status: "solicitada",
      quotedTotalCents: tier.priceCents,
    },
    select: { id: true },
  });

  let checkoutUrl: string | null = null;

  if (isStripeConfigured()) {
    const base = `${input.origin}/book`;
    const session = await createStripeCheckoutSession({
      currency: "mxn",
      customerEmail: input.email,
      successUrl: `${base}?membresia=${request.id}&pago=ok`,
      cancelUrl: `${base}?membresia=${request.id}&pago=cancelado`,
      lineItems: [
        {
          name: `Membresía ${tier.name}`,
          amountCents: tier.priceCents,
          quantity: 1,
        },
      ],
      metadata: { customerMembershipId: request.id },
    });
    checkoutUrl = session.url;
  } else {
    console.warn(
      "[checkout] STRIPE_SECRET_KEY not set — membership recorded, payment skipped.",
    );
  }

  return {
    ok: true,
    requestId: request.id,
    membershipName: tier.name,
    priceCents: tier.priceCents,
    checkoutUrl,
  };
}
