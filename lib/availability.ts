import type { Db } from "@/lib/db";
import {
  fitsWithinHours,
  parseOpeningHours,
  SLOT_MINUTES,
  windowFor,
  type OpeningHours,
} from "@/lib/opening-hours";

/**
 * Slot availability, per branch.
 *
 * BRANCH SCOPING LIVES HERE and is unaffected by the removal of tenants: every query
 * below filters on `branchId`, so Huayacán and Puerto Cancún keep entirely separate
 * calendars and can hold the same wall-clock time.
 *
 * Opening hours come from the branch row, not a constant: see lib/opening-hours.ts.
 */

export { SLOT_MINUTES };
export const BOOKING_HORIZON_DAYS = 60;

const MINUTE_MS = 60_000;

/** Local-time `YYYY-MM-DD`. Deliberately not toISOString(), which would shift the day. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A booking must start and finish inside that branch's open window for the day. */
export function isWithinBusinessHours(
  hours: OpeningHours,
  startsAt: Date,
  durationMin: number,
): boolean {
  return fitsWithinHours(hours, startsAt, durationMin);
}

/** Every slot a given day could offer at this branch, before checking what is booked. */
export function candidateSlotsForDay(
  hours: OpeningHours,
  day: Date,
  durationMin: number,
): Date[] {
  const window = windowFor(hours, day);
  if (!window) {
    return [];
  }

  const [open, close] = window;
  const slots: Date[] = [];
  const now = Date.now();

  for (
    let minutes = open;
    minutes + durationMin <= close;
    minutes += SLOT_MINUTES
  ) {
    const slot = new Date(day);
    slot.setHours(0, minutes, 0, 0);

    // A slot in the past is not bookable, so it is never offered.
    if (slot.getTime() > now) {
      slots.push(slot);
    }
  }

  return slots;
}

type BookedRange = { startsAt: Date; endsAt: Date };

function overlaps(slot: Date, durationMin: number, booked: BookedRange[]): boolean {
  const slotEnd = new Date(slot.getTime() + durationMin * MINUTE_MS);
  return booked.some((b) => b.startsAt < slotEnd && b.endsAt > slot);
}

/**
 * Appointments already holding time at ONE branch, within a window.
 *
 * Cancelled appointments do not hold a slot. Scoped by branch, so two branches of the
 * same business never block each other — and scoped by tenant by the wrapper, so
 * another business's calendar is invisible.
 */
async function bookedRanges(
  db: Db,
  branchId: string,
  from: Date,
  to: Date,
): Promise<BookedRange[]> {
  return db.appointment.findMany({
    where: {
      branchId,
      status: { not: "cancelled" },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: { startsAt: true, endsAt: true },
  });
}

/** True when nothing at this branch overlaps [startsAt, startsAt + durationMin). */
export async function isSlotFree(
  db: Db,
  branchId: string,
  startsAt: Date,
  durationMin: number,
): Promise<boolean> {
  const endsAt = new Date(startsAt.getTime() + durationMin * MINUTE_MS);

  const conflicting = await db.appointment.count({
    where: {
      branchId,
      status: { not: "cancelled" },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });

  return conflicting === 0;
}

/** Read a branch's hours through the scoped client. Null when the branch is not ours. */
export async function branchHours(
  db: Db,
  branchId: string,
): Promise<OpeningHours | null> {
  const branch = await db.branch.findFirst({
    where: { id: branchId, active: true },
    select: { openingHours: true },
  });

  return branch ? parseOpeningHours(branch.openingHours) : null;
}

/**
 * Free slots for one day at one branch, as plain Dates.
 *
 * Returns times only — no customer, no appointment ids. A visitor learns when the
 * business is free, which is the entire point of a public booking page, and nothing
 * else about who booked the rest.
 */
export async function availableSlotsForDay(
  db: Db,
  branchId: string,
  hours: OpeningHours,
  day: Date,
  durationMin: number,
): Promise<Date[]> {
  const candidates = candidateSlotsForDay(hours, day, durationMin);
  if (candidates.length === 0) {
    return [];
  }

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const booked = await bookedRanges(db, branchId, dayStart, dayEnd);

  return candidates.filter((slot) => !overlaps(slot, durationMin, booked));
}

/**
 * How many slots remain free on each day of a month, so the calendar can grey out
 * days that are fully booked or closed before the visitor taps them.
 *
 * One query for the whole month rather than one per day.
 */
export async function availabilityByDay(
  db: Db,
  branchId: string,
  hours: OpeningHours,
  monthStart: Date,
  durationMin: number,
): Promise<Record<string, number>> {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const horizonEnd = new Date();
  horizonEnd.setDate(horizonEnd.getDate() + BOOKING_HORIZON_DAYS);

  const booked = await bookedRanges(db, branchId, start, end);
  const counts: Record<string, number> = {};

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);

    // Nothing beyond the booking horizon is offered.
    if (day > horizonEnd) {
      continue;
    }

    const free = candidateSlotsForDay(hours, day, durationMin).filter(
      (slot) => !overlaps(slot, durationMin, booked),
    );

    if (free.length > 0) {
      counts[dayKey(day)] = free.length;
    }
  }

  return counts;
}
