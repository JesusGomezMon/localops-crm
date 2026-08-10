import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { db, requireStaff } from "@/lib/db";
import { serviceUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();

    const service = await db.service.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        active: true,
      },
    });

    if (!service) {
      return jsonError(404, "Not found");
    }

    return NextResponse.json({ service });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();
    const input = serviceUpdateSchema.parse(await readJson(request));

    const service = await db.service.update({
      where: { id },
      data: input,
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        active: true,
      },
    });

    return NextResponse.json({ service });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    await requireStaff();

    // Services are retired rather than deleted: appointments reference them, and the
    // schema restricts that FK on delete. Retiring also removes them from the public
    // booking page, which only lists active services.
    await db.service.update({
      where: { id },
      data: { active: false },
      select: { id: true },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
