import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { UnauthorizedError } from "@/lib/db";

/**
 * Shared error mapping for route handlers.
 *
 * The important property here is that error responses never echo back the resource
 * that was asked for. A staff member from Tenant A who requests one of Tenant B's
 * records gets a bare "Not found" — the same response they would get for an id that
 * does not exist anywhere. Nothing in the reply distinguishes "belongs to someone
 * else" from "does not exist", so the endpoint cannot be used to enumerate other
 * tenants' record ids.
 */
export function jsonError(
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return jsonError(401, "Authentication required");
  }

  if (error instanceof ZodError) {
    return jsonError(422, "Invalid request", {
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Raised when an update/delete matched nothing — which is exactly what happens
      // when the tenant filter injected by lib/db.ts excludes another tenant's row.
      case "P2025":
        return jsonError(404, "Not found");
      case "P2002":
        return jsonError(409, "Already exists");
      case "P2003":
        return jsonError(422, "Invalid reference");
    }
  }

  console.error(error);
  return jsonError(500, "Internal server error");
}

/** Parse a JSON body, tolerating an empty or malformed one as an empty object. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
