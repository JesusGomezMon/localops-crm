import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, readJson } from "@/lib/api";
import { db, requireStaff } from "@/lib/db";
import { customerCreateSchema } from "@/lib/validation";

// Note what is NOT in this file: any mention of tenantId, any ownership check, any
// filter on the session. `getTenantDb()` returns a client that cannot see another
// tenant's rows, so `findMany()` with no filter is already tenant-scoped.

export async function GET(_request: NextRequest) {
  try {
    await requireStaff();

    const customers = await db.customer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        _count: { select: { appointments: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ customers });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff();
    const input = customerCreateSchema.parse(await readJson(request));

    const customer = await db.customer.create({
      data: (input),
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
