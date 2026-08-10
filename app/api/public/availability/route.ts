import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError } from "@/lib/api";
import { getAvailability } from "@/lib/booking";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { availabilityQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Calendar availability for the public booking page. Unauthenticated, read-only.
 *
 * This is a second anonymous surface, so it gets the same treatment as the booking
 * endpoint: rate limited first, then shape-checked, then resolved entirely through a
 * slug-scoped client. It returns times and counts only — never a customer, never an
 * appointment id, never anything naming another tenant.
 *
 * The limit is looser than booking's, because reading a calendar is cheap and a
 * visitor legitimately flips through several months. It still exists so the endpoint
 * cannot be used as a free database-load generator.
 */
const AVAILABILITY_LIMIT = 60;
const AVAILABILITY_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  try {
    const ip = clientIpFrom(request.headers);
    const rate = checkRateLimit(
      `availability:${ip}`,
      AVAILABILITY_LIMIT,
      AVAILABILITY_WINDOW_MS,
    );

    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "retry-after": String(rate.retryAfterSeconds) },
        },
      );
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = availabilityQuerySchema.parse(params);

    const result = await getAvailability(query);

    if (!result.ok) {
      // Unknown tenant, unknown branch, another tenant's branch, another tenant's
      // service and a malformed date all produce this identical response.
      return jsonError(404, "Not found");
    }

    return NextResponse.json(
      result.mode === "month"
        ? { days: result.days }
        : { slots: result.slots },
      {
        // Availability changes as bookings arrive, so it is never cached.
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
