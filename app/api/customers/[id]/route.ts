import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { db, requireStaff } from "@/lib/db";
import { customerUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

// The `id` here is raw client input, and it is treated as such: it is passed to a
// scoped client that will only match it inside the caller's own tenant. An id
// belonging to another tenant resolves to null, and the handler cannot tell the
// difference between that and an id that never existed — which is the point.

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();

    const customer = await db.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        createdAt: true,
        appointments: {
          select: { id: true, startsAt: true, endsAt: true, status: true },
          orderBy: { startsAt: "desc" },
          take: 50,
        },
      },
    });

    if (!customer) {
      return jsonError(404, "Not found");
    }

    return NextResponse.json({ customer });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();
    const input = customerUpdateSchema.parse(await readJson(request));

    // A cross-tenant id matches nothing, so Prisma raises P2025 and
    // handleRouteError turns it into a 404.
    const customer = await db.customer.update({
      where: { id },
      data: input,
      select: { id: true, name: true, email: true, phone: true, notes: true },
    });

    return NextResponse.json({ customer });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();

    await db.customer.delete({ where: { id }, select: { id: true } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
