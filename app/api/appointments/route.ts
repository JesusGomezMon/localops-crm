import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { db, requireStaff } from "@/lib/db";
import { appointmentCreateSchema } from "@/lib/validation";

export async function GET(_request: NextRequest) {
  try {
    await requireStaff();

    const appointments = await db.appointment.findMany({
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        notes: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
        service: { select: { id: true, name: true, durationMin: true, priceCents: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ appointments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff();
    const input = appointmentCreateSchema.parse(await readJson(request));

    // `customerId` and `serviceId` are client-supplied foreign keys, and the database
    // alone will not stop them pointing at another tenant's rows: those rows genuinely
    // exist, so the FK constraint is satisfied. They are therefore re-read through the
    // SCOPED client first — a cross-tenant id comes back null and gets a 404. This is
    // not a hand-rolled tenant check; it is the same wrapper doing the work.
    const [branch, customer, service] = await Promise.all([
      db.branch.findUnique({
        where: { id: input.branchId },
        select: { id: true },
      }),
      db.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      }),
      db.service.findUnique({
        where: { id: input.serviceId },
        select: { id: true, durationMin: true },
      }),
    ]);

    if (!branch) {
      return jsonError(404, "Branch not found");
    }
    if (!customer) {
      return jsonError(404, "Customer not found");
    }
    if (!service) {
      return jsonError(404, "Service not found");
    }

    const startsAt = input.startsAt;
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);

    const appointment = await db.appointment.create({
      data: ({
        branchId: branch.id,
        customerId: customer.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        status: input.status ?? "confirmed",
        source: "staff",
        notes: input.notes,
      }),
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
      },
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
