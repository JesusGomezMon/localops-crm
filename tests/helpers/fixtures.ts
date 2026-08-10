// Test fixtures for the single-business app.
//
// These used to build two tenants, because cross-tenant isolation cannot be tested
// with one. That boundary is gone. What replaces it — and what the surviving tests
// exercise — is the BRANCH boundary: a regular branch and a VIP-only one, with
// different opening hours and separate calendars.

import { PrismaClient } from "@prisma/client";

import { DEFAULT_ADMIN_PASSWORD, hashPassword } from "@/lib/password";

export const rawPrisma = new PrismaClient();

export type Fixtures = {
  /** Mixed-tier branch, Mon–Sat 09:00–17:00, closed Sunday. */
  branchId: string;
  branchName: string;
  /** VIP-only branch, same hours PLUS Sunday 11:00–19:00. */
  vipBranchId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  /** tier "universal", kind "service" — bookable at either branch. */
  serviceId: string;
  serviceName: string;
  /** tier "basico" — must be refused at the VIP-only branch. */
  basicoServiceId: string;
  /** kind "extra" — multi-select, additive. */
  extraServiceId: string;
  extraPriceCents: number;
  inactiveServiceId: string;
  appointmentId: string;
  bookedSlot: Date;
  freeSlot: Date;
  /** A Sunday: closed at `branchId`, open at `vipBranchId`. */
  sundaySlot: Date;
};

/**
 * A deterministic future slot, so availability assertions do not drift depending on
 * which day the suite happens to run.
 * `dayOfWeek` follows `Date.prototype.getDay()`: 0 = Sunday .. 6 = Saturday.
 */
export function nextWeekdayAt(dayOfWeek: number, hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== dayOfWeek) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

async function truncateAll() {
  // FK-safe order: children before parents.
  await rawPrisma.auditLog.deleteMany();
  await rawPrisma.customerMembership.deleteMany();
  await rawPrisma.invoice.deleteMany();
  await rawPrisma.appointment.deleteMany();
  await rawPrisma.membership.deleteMany();
  await rawPrisma.branch.deleteMany();
  await rawPrisma.service.deleteMany();
  await rawPrisma.customer.deleteMany();
  await rawPrisma.user.deleteMany();
}

// Mon–Sat 09:00–17:00, closed Sunday.
const WEEKDAY_HOURS = JSON.stringify({
  1: [540, 1020],
  2: [540, 1020],
  3: [540, 1020],
  4: [540, 1020],
  5: [540, 1020],
  6: [540, 1020],
});

// Same, but ALSO open Sunday 11:00–19:00 — so "hours are per branch" stays testable.
const WITH_SUNDAY_HOURS = JSON.stringify({
  1: [540, 1020],
  2: [540, 1020],
  3: [540, 1020],
  4: [540, 1020],
  5: [540, 1020],
  6: [540, 1020],
  0: [660, 1140],
});

export async function resetAndSeed(): Promise<Fixtures> {
  await truncateAll();

  const bookedSlot = nextWeekdayAt(1, 10);
  const freeSlot = nextWeekdayAt(1, 14);

  // The staff account, hashed exactly as the seed does it — so the auth tests are
  // checking the real stored form, not a fixture-only shortcut.
  await rawPrisma.user.create({
    data: {
      username: "admin",
      passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      name: "Kasterz Admin",
      role: "owner",
    },
  });

  const branchName = "Huayacán";
  const branch = await rawPrisma.branch.create({
    data: {
      name: branchName,
      slug: "Huayacan",
      address: "Cancún",
      active: true,
      vipOnly: false,
      openingHours: WEEKDAY_HOURS,
    },
  });

  const vipBranch = await rawPrisma.branch.create({
    data: {
      name: "Puerto Cancún",
      slug: "PuertoCancun",
      address: "Cancún",
      active: true,
      vipOnly: true,
      amenities: JSON.stringify(["Sauna"]),
      openingHours: WITH_SUNDAY_HOURS,
    },
  });

  const customerName = "Cliente Kasterz";
  const customerEmail = "cliente@kasterz.test";
  const customer = await rawPrisma.customer.create({
    data: { name: customerName, email: customerEmail, phone: "+52 998 000 0000" },
  });

  const serviceName = "Corte de cabello VIP";
  const service = await rawPrisma.service.create({
    data: {
      name: serviceName,
      durationMin: 60,
      priceCents: 49900,
      active: true,
      tier: "universal",
      kind: "service",
    },
  });

  const basicoService = await rawPrisma.service.create({
    data: {
      name: "Corte de cabello",
      durationMin: 60,
      priceCents: 39900,
      active: true,
      tier: "basico",
      kind: "service",
    },
  });

  const extraService = await rawPrisma.service.create({
    data: {
      name: "Ceja",
      durationMin: 15,
      priceCents: 18000,
      active: true,
      tier: "universal",
      kind: "extra",
    },
  });

  const inactiveService = await rawPrisma.service.create({
    data: { name: "Servicio retirado", durationMin: 60, priceCents: 1000, active: false },
  });

  const appointment = await rawPrisma.appointment.create({
    data: {
      branchId: branch.id,
      customerId: customer.id,
      serviceId: service.id,
      startsAt: bookedSlot,
      endsAt: new Date(bookedSlot.getTime() + 60 * 60 * 1000),
      status: "confirmed",
      source: "staff",
      totalCents: 49900,
    },
  });

  return {
    branchId: branch.id,
    branchName,
    vipBranchId: vipBranch.id,
    customerId: customer.id,
    customerName,
    customerEmail,
    serviceId: service.id,
    serviceName,
    basicoServiceId: basicoService.id,
    extraServiceId: extraService.id,
    extraPriceCents: extraService.priceCents,
    inactiveServiceId: inactiveService.id,
    appointmentId: appointment.id,
    bookedSlot,
    freeSlot,
    sundaySlot: nextWeekdayAt(0, 12),
  };
}
