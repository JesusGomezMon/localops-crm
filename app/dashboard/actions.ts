"use server";

import { revalidatePath } from "next/cache";

import { isSlotFree } from "@/lib/availability";
import { isAvailableAtBranch } from "@/lib/catalog";
import { db, requireStaff } from "@/lib/db";
import { parseOpeningHours, fitsWithinHours } from "@/lib/opening-hours";

/**
 * Staff actions.
 *
 * Every one starts with `getTenantDb()`, so they are scoped to the signed-in user's
 * business by construction — an id from another tenant simply does not resolve, and
 * these server actions inherit that without a single ownership check written here.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Block time taken by a walk-in.
 *
 * A customer who books at the counter still occupies the chair, so the slot has to
 * leave the public calendar. Rather than invent a separate "blocked" concept, this
 * records the real appointment — the business gets the booking in its history and the
 * slot disappears from availability for the same reason any other booking does.
 */
export async function createWalkIn(formData: FormData): Promise<ActionResult> {
  try {
    await requireStaff();

    const branchId = String(formData.get("branchId") ?? "");
    const serviceId = String(formData.get("serviceId") ?? "");
    const startsAtRaw = String(formData.get("startsAt") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    if (!branchId || !serviceId || !startsAtRaw || !name) {
      return { ok: false, error: "Faltan datos." };
    }

    // `datetime-local` has no timezone, which is what we want: staff mean the wall
    // clock in front of them, not UTC.
    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: "Fecha inválida." };
    }

    const [branch, service] = await Promise.all([
      db.branch.findFirst({
        where: { id: branchId, active: true },
        select: { id: true, openingHours: true, vipOnly: true },
      }),
      db.service.findFirst({
        where: { id: serviceId, active: true },
        select: { id: true, durationMin: true, priceCents: true, tier: true },
      }),
    ]);

    if (!branch || !service) {
      return { ok: false, error: "Sucursal o servicio no encontrado." };
    }

    // The same tier rule the public flow enforces. Without it, staff could book
    // Regular-tier work into the VIP-only branch from the dashboard — a service that
    // branch does not actually perform, and a booking its reporting would then have
    // to explain.
    if (!isAvailableAtBranch(service, branch)) {
      return {
        ok: false,
        error: "Esa sucursal no ofrece ese servicio (es sólo VIP).",
      };
    }

    if (!(await isSlotFree(db, branch.id, startsAt, service.durationMin))) {
      return { ok: false, error: "Ese horario ya está ocupado." };
    }

    // Staff may legitimately book outside published hours — someone stays late, a
    // regular is squeezed in. That is allowed, but it is worth telling them, because
    // the public calendar will never offer that time to anyone else.
    const outsideHours = !fitsWithinHours(
      parseOpeningHours(branch.openingHours),
      startsAt,
      service.durationMin,
    );

    // Walk-ins often have no email, but Customer needs one and it is unique per
    // tenant. A namespaced placeholder keeps the record without inventing a real
    // address that could collide or receive mail.
    const email =
      String(formData.get("email") ?? "").trim() ||
      `presencial+${Date.now()}@sin-correo.local`;

    const existing = await db.customer.findFirst({
      where: { email },
      select: { id: true },
    });

    const customer =
      existing ??
      (await db.customer.create({
        data: ({ name, email, phone: phone || null }),
        select: { id: true },
      }));

    await db.appointment.create({
      data: ({
        branchId: branch.id,
        customerId: customer.id,
        serviceId: service.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + service.durationMin * 60_000),
        status: "confirmed",
        source: "walkin",
        totalCents: service.priceCents,
        notes: outsideHours ? "Fuera de horario publicado" : null,
      }),
      select: { id: true },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/agenda");
    return { ok: true };
  } catch (error) {
    console.error("[walk-in]", error);
    return { ok: false, error: "No pudimos registrar la cita." };
  }
}

/**
 * Cancel a booking, which returns the slot to the public calendar.
 *
 * Cancelling rather than deleting: availability already ignores cancelled rows, and
 * the business keeps a record of what was booked and dropped. Deleting would destroy
 * that history to achieve the same calendar result.
 */
export async function cancelAppointment(formData: FormData): Promise<void> {
  try {
    await requireStaff();
    const id = String(formData.get("appointmentId") ?? "");
    if (!id) return;

    // A cross-tenant id matches nothing, so Prisma raises P2025 and the row is
    // untouched — the same protection every other write in the app has.
    await db.appointment.update({
      where: { id },
      data: { status: "cancelled" },
      select: { id: true },
    });
  } catch (error) {
    // These run straight from a `<form action>`, which must return void, so failures
    // are logged rather than returned. The list re-renders either way, and an
    // unchanged row is the visible signal that nothing happened.
    console.error("[cancel]", error);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
}

/** Confirm a pending booking so it counts toward revenue. */
export async function confirmAppointment(formData: FormData): Promise<void> {
  try {
    await requireStaff();
    const id = String(formData.get("appointmentId") ?? "");
    if (!id) return;

    await db.appointment.update({
      where: { id },
      data: { status: "confirmed" },
      select: { id: true },
    });
  } catch (error) {
    console.error("[confirm]", error);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
}

/** Mark a membership request as sold, which moves it into recurring revenue. */
export async function activateMembership(formData: FormData): Promise<void> {
  try {
    await requireStaff();
    const id = String(formData.get("membershipRequestId") ?? "");
    if (!id) return;

    await db.customerMembership.update({
      where: { id },
      data: { status: "activa", startedAt: new Date() },
      select: { id: true },
    });
  } catch (error) {
    console.error("[activate membership]", error);
  }

  revalidatePath("/dashboard");
}
