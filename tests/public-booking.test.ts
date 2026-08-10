/**
 * The public booking endpoint.
 *
 * The cross-tenant cases that used to dominate this file are gone with the tenant
 * system. What remains is the boundary that still exists and still matters: BRANCH.
 * A VIP-only branch must refuse Regular-tier work, branches must not share calendars,
 * and neither the price nor the slot may be dictated by the client.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { resetRateLimits } from "@/lib/rate-limit";
import { rawPrisma, resetAndSeed, type Fixtures } from "./helpers/fixtures";

let fx: Fixtures;

beforeEach(async () => {
  fx = await resetAndSeed();
  resetRateLimits();
});

type BookingBody = {
  branchId: string;
  serviceId: string;
  extraIds: string[];
  startsAt: string;
  name: string;
  email: string;
  phone: string;
  [key: string]: unknown;
};

function bookingRequest(body: Partial<BookingBody>, ip = "203.0.113.10") {
  return new NextRequest("http://localhost/api/public/book", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function validBooking(overrides: Partial<BookingBody> = {}): Partial<BookingBody> {
  return {
    branchId: fx.branchId,
    serviceId: fx.serviceId,
    startsAt: fx.freeSlot.toISOString(),
    name: "Visitante Anónimo",
    email: "visitante@example.test",
    phone: "+52 998 123 4567",
    ...overrides,
  };
}

function localDayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function daysAfterFreeSlot(days: number): Date {
  const slot = new Date(fx.freeSlot);
  slot.setDate(slot.getDate() + days);
  return slot;
}

function availabilityRequest(params: Record<string, string>, ip = "203.0.113.20") {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/public/availability?${qs}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("booking basics", () => {
  it("accepts a valid booking and records it as pending", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(bookingRequest(validBooking()));
    expect(res.status).toBe(201);

    const created = await rawPrisma.appointment.findFirst({
      where: { source: "public" },
      select: { branchId: true, status: true },
    });

    expect(created?.branchId).toBe(fx.branchId);
    expect(created?.status).toBe("pending");
  });

  it("404s an unknown service without saying why", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(validBooking({ serviceId: "svc_inexistente" })),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("rejects a retired service", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(validBooking({ serviceId: fx.inactiveServiceId })),
    );

    expect(res.status).toBe(404);
  });

  it("refuses an unexpected key in the body", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(bookingRequest(validBooking({ totalCents: 1 })));

    expect(res.status).toBe(422);
    expect(await rawPrisma.appointment.count({ where: { source: "public" } })).toBe(0);
  });
});

describe("branch tier enforcement", () => {
  it("refuses Regular-tier work at the VIP-only branch", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    // Hiding the option in the UI stops honest mistakes; this stops a hand-crafted
    // request booking a $399 Básico cut into the VIP-only branch.
    const res = await POST(
      bookingRequest(
        validBooking({
          branchId: fx.vipBranchId,
          serviceId: fx.basicoServiceId,
        }),
      ),
    );

    expect(res.status).toBe(404);
    expect(await rawPrisma.appointment.count({ where: { source: "public" } })).toBe(0);
  });

  it("accepts that same Regular service at the branch that does offer it", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(validBooking({ serviceId: fx.basicoServiceId }), "203.0.113.11"),
    );

    expect(res.status).toBe(201);
  });

  it("gives a tier-blocked service the same answer as a nonexistent one", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const blocked = await POST(
      bookingRequest(
        validBooking({ branchId: fx.vipBranchId, serviceId: fx.basicoServiceId }),
      ),
    );
    const missing = await POST(
      bookingRequest(validBooking({ serviceId: "svc_nope" }), "203.0.113.12"),
    );

    expect(blocked.status).toBe(missing.status);
    expect(await blocked.json()).toEqual(await missing.json());
  });

  it("hides the tier-blocked service from the calendar too", async () => {
    const { getAvailability } = await import("@/lib/booking");

    const result = await getAvailability({
      branchId: fx.vipBranchId,
      serviceId: fx.basicoServiceId,
      date: localDayKey(fx.freeSlot),
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("never offers Regular-tier work at the VIP branch on the booking page", async () => {
    const { getBookingPageData } = await import("@/lib/booking");
    const { visibleCatalog } = await import("@/lib/catalog");

    const page = await getBookingPageData();
    const vipBranch = page.branches.find((b) => b.id === fx.vipBranchId)!;

    const visible = visibleCatalog(page.services, vipBranch);
    const ids = [...visible.primary, ...visible.extras].map((s) => s.id);

    expect(ids).not.toContain(fx.basicoServiceId);
    expect(ids).toContain(fx.serviceId);
    // Extras stay available at every branch.
    expect(ids).toContain(fx.extraServiceId);
  });
});

describe("branches keep separate calendars", () => {
  it("refuses a slot already taken at that branch", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(validBooking({ startsAt: fx.bookedSlot.toISOString() })),
    );

    expect(res.status).toBe(409);
  });

  it("allows the same wall-clock time at the other branch", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(
        validBooking({
          branchId: fx.vipBranchId,
          startsAt: fx.bookedSlot.toISOString(),
          email: "otra-sucursal@example.test",
        }),
        "203.0.113.13",
      ),
    );

    expect(res.status).toBe(201);
  });
});

describe("opening hours are per branch", () => {
  it("offers no Sunday slots at the branch closed on Sundays", async () => {
    const { GET } = await import("@/app/api/public/availability/route");

    const res = await GET(
      availabilityRequest({
        branchId: fx.branchId,
        serviceId: fx.serviceId,
        date: localDayKey(fx.sundaySlot),
      }),
    );

    const body = (await res.json()) as { slots: string[] };
    expect(body.slots).toEqual([]);
  });

  it("offers Sunday slots at the branch that opens on Sundays", async () => {
    const { GET } = await import("@/app/api/public/availability/route");

    const res = await GET(
      availabilityRequest(
        {
          branchId: fx.vipBranchId,
          serviceId: fx.serviceId,
          date: localDayKey(fx.sundaySlot),
        },
        "203.0.113.21",
      ),
    );

    const body = (await res.json()) as { slots: string[] };
    expect(body.slots.length).toBeGreaterThan(0);
  });

  it("treats a branch with unparseable hours as closed rather than always open", async () => {
    const { getAvailability } = await import("@/lib/booking");

    await rawPrisma.branch.update({
      where: { id: fx.branchId },
      data: { openingHours: "not json at all" },
    });

    const result = await getAvailability({
      branchId: fx.branchId,
      serviceId: fx.serviceId,
      date: localDayKey(fx.freeSlot),
    });

    expect(result).toEqual({ ok: true, mode: "day", slots: [] });
  });

  it("rejects a time outside business hours, and one in the past", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const midnight = new Date(fx.freeSlot);
    midnight.setHours(3, 0, 0, 0);

    const outside = await POST(
      bookingRequest(validBooking({ startsAt: midnight.toISOString() })),
    );
    const past = await POST(
      bookingRequest(
        validBooking({ startsAt: new Date(Date.now() - 60_000).toISOString() }),
        "203.0.113.14",
      ),
    );

    expect(outside.status).toBe(409);
    expect(past.status).toBe(409);
  });
});

describe("availability endpoint", () => {
  it("omits a slot that is already taken rather than marking it", async () => {
    const { GET } = await import("@/app/api/public/availability/route");

    const res = await GET(
      availabilityRequest({
        branchId: fx.branchId,
        serviceId: fx.serviceId,
        date: localDayKey(fx.bookedSlot),
      }),
    );

    const body = (await res.json()) as { slots: string[] };
    expect(body.slots).not.toContain(fx.bookedSlot.toISOString());
  });

  it("404s an unknown branch", async () => {
    const { GET } = await import("@/app/api/public/availability/route");

    const res = await GET(
      availabilityRequest(
        { branchId: "br_nope", serviceId: fx.serviceId, month: "2099-01" },
        "203.0.113.22",
      ),
    );

    expect(res.status).toBe(404);
  });

  it("refuses an unexpected key in the query string", async () => {
    const { GET } = await import("@/app/api/public/availability/route");

    const res = await GET(
      availabilityRequest(
        { branchId: fx.branchId, serviceId: fx.serviceId, tenantId: "x" },
        "203.0.113.23",
      ),
    );

    expect(res.status).toBe(422);
  });
});

describe("pricing is decided by the server", () => {
  it("adds each extra to the stored total", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(validBooking({ extraIds: [fx.extraServiceId] }), "203.0.113.30"),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { booking: { totalCents: number } };

    const service = await rawPrisma.service.findUnique({
      where: { id: fx.serviceId },
      select: { priceCents: true },
    });

    expect(body.booking.totalCents).toBe(service!.priceCents + fx.extraPriceCents);
  });

  it("refuses a package smuggled into the extras array", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const res = await POST(
      bookingRequest(validBooking({ extraIds: [fx.serviceId] }), "203.0.113.31"),
    );

    expect(res.status).toBe(404);
    expect(await rawPrisma.appointment.count({ where: { source: "public" } })).toBe(0);
  });
});

describe("membership purchase", () => {
  it("records a purchase request and refuses a bad tier id", async () => {
    const { POST } = await import("@/app/api/public/membership/route");

    const tier = await rawPrisma.membership.create({
      data: {
        name: "Diamante",
        priceCents: 199900,
        benefits: "[]",
        plans: "[]",
        active: true,
      },
      select: { id: true },
    });

    const ok = await POST(
      new NextRequest("http://localhost/api/public/membership", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.77",
        },
        body: JSON.stringify({
          membershipId: tier.id,
          name: "Socio",
          email: "socio@example.test",
          phone: "+52 998 000 0000",
        }),
      }),
    );

    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { checkoutUrl: string | null; priceCents: number };
    expect(body.priceCents).toBe(199900);
    expect(body.checkoutUrl).toBeNull();
    expect(
      await rawPrisma.customerMembership.count({
        where: { membershipId: tier.id, status: "solicitada" },
      }),
    ).toBe(1);

    const missing = await POST(
      new NextRequest("http://localhost/api/public/membership", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.78",
        },
        body: JSON.stringify({
          membershipId: "does-not-exist",
          name: "Socio",
          email: "otro-socio@example.test",
          phone: "+52 998 000 0001",
        }),
      }),
    );
    expect(missing.status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("rejects repeated submissions from one IP once the limit is passed", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const limit = Number(process.env.BOOKING_RATE_LIMIT ?? 5);
    const ip = "198.51.100.42";
    const statuses: number[] = [];

    for (let i = 0; i < limit + 2; i += 1) {
      const res = await POST(
        bookingRequest(
          validBooking({
            startsAt: daysAfterFreeSlot(i).toISOString(),
            email: `visitante-${i}@example.test`,
          }),
          ip,
        ),
      );
      statuses.push(res.status);
    }

    expect(statuses.slice(0, limit)).toEqual(Array(limit).fill(201));
    expect(statuses[limit]).toBe(429);
    expect(statuses[limit + 1]).toBe(429);
  });

  it("counts each IP separately", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const limit = Number(process.env.BOOKING_RATE_LIMIT ?? 5);

    for (let i = 0; i < limit + 1; i += 1) {
      await POST(
        bookingRequest(validBooking({ email: `flood-${i}@example.test` }), "198.51.100.1"),
      );
    }

    const other = await POST(
      bookingRequest(
        validBooking({
          startsAt: daysAfterFreeSlot(1).toISOString(),
          email: "otro@example.test",
        }),
        "198.51.100.2",
      ),
    );

    expect(other.status).toBe(201);
  });

  it("sends a Retry-After header with a 429", async () => {
    const { POST } = await import("@/app/api/public/book/route");

    const limit = Number(process.env.BOOKING_RATE_LIMIT ?? 5);
    const ip = "198.51.100.99";
    let last: Response | undefined;

    for (let i = 0; i < limit + 1; i += 1) {
      last = await POST(
        bookingRequest(validBooking({ email: `burst-${i}@example.test` }), ip),
      );
    }

    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
