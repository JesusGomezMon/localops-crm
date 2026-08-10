import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { db, requireStaff } from "@/lib/db";
import { appointmentUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();

    const appointment = await db.appointment.findUnique({
      where: { id },
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
    });

    if (!appointment) {
      return jsonError(404, "Not found");
    }

    return NextResponse.json({ appointment });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();
    const input = appointmentUpdateSchema.parse(await readJson(request));

    // Reassigning to a different branch, customer or service re-validates the target
    // through the scoped client, for the same reason POST does.
    if (input.branchId) {
      const branch = await db.branch.findUnique({
        where: { id: input.branchId },
        select: { id: true },
      });
      if (!branch) {
        return jsonError(404, "Branch not found");
      }
    }

    if (input.customerId) {
      const customer = await db.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) {
        return jsonError(404, "Customer not found");
      }
    }

    let endsAt: Date | undefined;
    if (input.serviceId || input.startsAt) {
      const existing = await db.appointment.findUnique({
        where: { id },
        select: { startsAt: true, serviceId: true },
      });
      if (!existing) {
        return jsonError(404, "Not found");
      }

      const service = await db.service.findUnique({
        where: { id: input.serviceId ?? existing.serviceId },
        select: { id: true, durationMin: true },
      });
      if (!service) {
        return jsonError(404, "Service not found");
      }

      const startsAt = input.startsAt ?? existing.startsAt;
      endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
    }

    const appointment = await db.appointment.update({
      where: { id },
      data: { ...input, ...(endsAt ? { endsAt } : {}) },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        notes: true,
      },
    });

    return NextResponse.json({ appointment });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();

    await db.appointment.delete({ where: { id }, select: { id: true } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
