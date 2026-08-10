import type { Db } from "@/lib/db";

/**
 * Dashboard figures.
 *
 * Revenue is counted from `Appointment.totalCents`, the price agreed when the booking
 * was made. It is deliberately NOT recomputed from today's price list: a service that
 * went up last week must not silently inflate last month's takings.
 */

export type DashboardStats = {
  revenue: { monthCents: number; todayCents: number; pendingCents: number };
  appointments: {
    today: number;
    upcoming: number;
    pending: number;
    monthCompleted: number;
  };
  memberships: {
    active: number;
    requested: number;
    monthlyRecurringCents: number;
    newThisMonth: number;
  };
  customers: { total: number; newThisMonth: number };
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = startOfMonth();
  const now = new Date();

  const [
    monthRevenue,
    todayRevenue,
    pendingRevenue,
    todayCount,
    upcomingCount,
    pendingCount,
    monthCompleted,
    activeMemberships,
    requestedMemberships,
    newMemberships,
    customerCount,
    newCustomers,
  ] = await Promise.all([
    // Money only counts once the work is done — a cancelled booking is not income.
    db.appointment.aggregate({
      _sum: { totalCents: true },
      where: { startsAt: { gte: monthStart }, status: { in: ["confirmed", "completed"] } },
    }),
    db.appointment.aggregate({
      _sum: { totalCents: true },
      where: {
        startsAt: { gte: today, lt: tomorrow },
        status: { in: ["confirmed", "completed"] },
      },
    }),
    db.appointment.aggregate({
      _sum: { totalCents: true },
      where: { startsAt: { gte: now }, status: "pending" },
    }),

    db.appointment.count({
      where: { startsAt: { gte: today, lt: tomorrow }, status: { not: "cancelled" } },
    }),
    db.appointment.count({
      where: { startsAt: { gte: now }, status: { not: "cancelled" } },
    }),
    db.appointment.count({ where: { status: "pending", startsAt: { gte: now } } }),
    db.appointment.count({
      where: { startsAt: { gte: monthStart, lt: now }, status: "completed" },
    }),

    db.customerMembership.count({ where: { status: "activa" } }),
    db.customerMembership.count({ where: { status: "solicitada" } }),
    db.customerMembership.count({ where: { requestedAt: { gte: monthStart } } }),

    db.customer.count(),
    db.customer.count({ where: { createdAt: { gte: monthStart } } }),
  ]);

  // Recurring revenue is the sum of the tiers behind every active membership, so it
  // reflects who actually subscribed rather than what the price list advertises.
  const active = await db.customerMembership.findMany({
    where: { status: "activa" },
    select: { membership: { select: { priceCents: true } } },
  });

  return {
    revenue: {
      monthCents: monthRevenue._sum.totalCents ?? 0,
      todayCents: todayRevenue._sum.totalCents ?? 0,
      pendingCents: pendingRevenue._sum.totalCents ?? 0,
    },
    appointments: {
      today: todayCount,
      upcoming: upcomingCount,
      pending: pendingCount,
      monthCompleted,
    },
    memberships: {
      active: activeMemberships,
      requested: requestedMemberships,
      monthlyRecurringCents: active.reduce(
        (sum, m) => sum + m.membership.priceCents,
        0,
      ),
      newThisMonth: newMemberships,
    },
    customers: { total: customerCount, newThisMonth: newCustomers },
  };
}

/** Membership requests raised from the booking upsell, newest first. */
export async function getMembershipRequests(db: Db, take = 25) {
  return db.customerMembership.findMany({
    where: { status: { in: ["solicitada", "activa"] } },
    select: {
      id: true,
      status: true,
      requestedAt: true,
      quotedTotalCents: true,
      customer: { select: { name: true, phone: true, email: true } },
      membership: { select: { name: true, priceCents: true } },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take,
  });
}

/** Upcoming bookings for the agenda view. */
export async function getUpcomingAppointments(db: Db, take = 100) {
  const from = startOfToday();

  return db.appointment.findMany({
    where: { startsAt: { gte: from } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      source: true,
      totalCents: true,
      notes: true,
      branch: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      service: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
    take,
  });
}
