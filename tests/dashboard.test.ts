/**
 * Staff dashboard behaviour.
 *
 * The cross-tenant assertions are gone with the tenant system. What still matters:
 * blocking a slot at the counter genuinely removes it from the public calendar,
 * cancelling gives it back, the branch tier rule applies to staff too, and the
 * membership counts move only when staff activate one.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { rawPrisma, resetAndSeed, type Fixtures } from "./helpers/fixtures";

const sessionHolder: { current: unknown } = { current: null };

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => sessionHolder.current),
}));

// Server actions call revalidatePath, which needs a request scope Vitest does not
// provide. Stubbing it keeps the test about the database work.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let fx: Fixtures;

beforeEach(async () => {
  fx = await resetAndSeed();
  sessionHolder.current = {
    user: { id: "u1", email: "owner@kasterz.test", role: "owner" },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  };
});

function walkInForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("branchId", fx.branchId);
  form.set("serviceId", fx.serviceId);
  form.set("startsAt", localInputValue(fx.freeSlot));
  form.set("name", "Cliente Mostrador");
  form.set("phone", "+52 998 555 0000");
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

/** `datetime-local` format: local wall clock, no timezone suffix. */
function localInputValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(
    date.getHours(),
  )}:${p(date.getMinutes())}`;
}

function localDayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

async function publicSlots(branchId: string, day: Date): Promise<string[]> {
  const { GET } = await import("@/app/api/public/availability/route");
  const qs = new URLSearchParams({
    branchId,
    serviceId: fx.serviceId,
    date: localDayKey(day),
  }).toString();

  const res = await GET(
    new NextRequest(`http://localhost/api/public/availability?${qs}`, {
      headers: { "x-forwarded-for": "203.0.113.90" },
    }),
  );
  const body = (await res.json()) as { slots?: string[] };
  return body.slots ?? [];
}

describe("blocking a slot booked in person", () => {
  it("removes the time from the public calendar", async () => {
    const { createWalkIn } = await import("@/app/dashboard/actions");

    const before = await publicSlots(fx.branchId, fx.freeSlot);
    expect(before).toContain(fx.freeSlot.toISOString());

    expect(await createWalkIn(walkInForm())).toEqual({ ok: true });

    const after = await publicSlots(fx.branchId, fx.freeSlot);
    expect(after).not.toContain(fx.freeSlot.toISOString());
  });

  it("records it as a real appointment, marked as taken in person", async () => {
    const { createWalkIn } = await import("@/app/dashboard/actions");
    await createWalkIn(walkInForm());

    const appointment = await rawPrisma.appointment.findFirst({
      where: { source: "walkin" },
      select: { status: true, totalCents: true, customer: { select: { name: true } } },
    });

    expect(appointment?.status).toBe("confirmed");
    expect(appointment?.customer.name).toBe("Cliente Mostrador");
    expect(appointment?.totalCents).toBeGreaterThan(0);
  });

  it("refuses to double-book a time that is already taken", async () => {
    const { createWalkIn } = await import("@/app/dashboard/actions");

    expect((await createWalkIn(walkInForm())).ok).toBe(true);

    const second = await createWalkIn(
      walkInForm({ name: "Otro Cliente", email: "otro@example.test" }),
    );
    expect(second).toEqual({ ok: false, error: "Ese horario ya está ocupado." });
  });

  it("does not touch another branch's calendar", async () => {
    const { createWalkIn } = await import("@/app/dashboard/actions");
    await createWalkIn(walkInForm());

    const other = await publicSlots(fx.vipBranchId, fx.freeSlot);
    expect(other).toContain(fx.freeSlot.toISOString());
  });

  it("refuses Regular-tier work at the VIP-only branch, like the public flow does", async () => {
    const { createWalkIn } = await import("@/app/dashboard/actions");

    const result = await createWalkIn(
      walkInForm({ branchId: fx.vipBranchId, serviceId: fx.basicoServiceId }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Esa sucursal no ofrece ese servicio (es sólo VIP).",
    });
    expect(await rawPrisma.appointment.count({ where: { source: "walkin" } })).toBe(0);
  });

  it("refuses an unknown branch", async () => {
    const { createWalkIn } = await import("@/app/dashboard/actions");

    const result = await createWalkIn(walkInForm({ branchId: "br_nope" }));

    expect(result.ok).toBe(false);
    expect(await rawPrisma.appointment.count({ where: { source: "walkin" } })).toBe(0);
  });
});

describe("cancelling frees the slot again", () => {
  it("returns the time to the public calendar", async () => {
    const { createWalkIn, cancelAppointment } = await import(
      "@/app/dashboard/actions"
    );

    await createWalkIn(walkInForm());
    const created = await rawPrisma.appointment.findFirstOrThrow({
      where: { source: "walkin" },
      select: { id: true },
    });

    const form = new FormData();
    form.set("appointmentId", created.id);
    await cancelAppointment(form);

    const after = await publicSlots(fx.branchId, fx.freeSlot);
    expect(after).toContain(fx.freeSlot.toISOString());
  });
});

describe("dashboard figures", () => {
  it("counts the business's bookings and customers", async () => {
    const { getDashboardStats } = await import("@/lib/reporting");
    const { db } = await import("@/lib/db");

    const stats = await getDashboardStats(db);

    expect(stats.customers.total).toBe(1);
    expect(stats.appointments.upcoming).toBe(1);
  });

  it("counts a membership only once staff activate it", async () => {
    const { getDashboardStats } = await import("@/lib/reporting");
    const { db } = await import("@/lib/db");
    const { activateMembership } = await import("@/app/dashboard/actions");

    const tier = await rawPrisma.membership.create({
      data: { name: "Gold", priceCents: 79900, plans: "[]", benefits: "[]" },
    });

    const request = await db.customerMembership.create({
      data: {
        customerId: fx.customerId,
        membershipId: tier.id,
        status: "solicitada",
        quotedTotalCents: 99800,
      },
      select: { id: true },
    });

    const before = await getDashboardStats(db);
    expect(before.memberships.requested).toBe(1);
    expect(before.memberships.active).toBe(0);
    expect(before.memberships.monthlyRecurringCents).toBe(0);

    const form = new FormData();
    form.set("membershipRequestId", request.id);
    await activateMembership(form);

    const after = await getDashboardStats(db);
    expect(after.memberships.active).toBe(1);
    expect(after.memberships.monthlyRecurringCents).toBe(79900);
  });
});
