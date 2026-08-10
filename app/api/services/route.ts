import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, readJson } from "@/lib/api";
import { db, requireStaff } from "@/lib/db";
import { serviceCreateSchema } from "@/lib/validation";

export async function GET(_request: NextRequest) {
  try {
    await requireStaff();

    const services = await db.service.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        active: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ services });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff();
    const input = serviceCreateSchema.parse(await readJson(request));

    const service = await db.service.create({
      data: (input),
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        active: true,
      },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
