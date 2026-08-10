import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { createPublicBooking } from "@/lib/booking";
import {
  bookingRateLimitConfig,
  checkRateLimit,
  clientIpFrom,
} from "@/lib/rate-limit";
import { publicBookingSchema } from "@/lib/validation";

// Prisma needs Node APIs.
export const runtime = "nodejs";

/**
 * The only write endpoint reachable without authentication.
 *
 * Order matters here, cheapest rejection first: rate limit, then shape, then
 * existence, then availability. A flood of junk is turned away before it can touch
 * the parser, let alone the database.
 */
export async function POST(request: NextRequest) {
  try {
    const { limit, windowMs } = bookingRateLimitConfig();
    const ip = clientIpFrom(request.headers);
    const rate = checkRateLimit(`book:${ip}`, limit, windowMs);

    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many booking attempts. Please try again shortly." },
        {
          status: 429,
          headers: {
            "retry-after": String(rate.retryAfterSeconds),
            "x-ratelimit-limit": String(rate.limit),
            "x-ratelimit-remaining": "0",
          },
        },
      );
    }

    // `.strict()` — a body carrying an unexpected key, `tenantId` above all, is a 422
    // rather than a field that gets quietly ignored.
    //
    // `origin` is taken from the request URL, not the body: Stripe's return URLs must
    // point back at this deployment, and letting a caller choose them would turn the
    // payment redirect into an open redirect.
    const body = await readJson(request);
    const input = publicBookingSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      origin: request.nextUrl.origin,
    });

    const result = await createPublicBooking(input);

    if (!result.ok) {
      switch (result.reason) {
        // A branch or service the caller may not use produces the identical response
        // to one that does not exist. Nothing here confirms that an id is real, or
        // that it belongs to a branch with a different tier.
        case "branch_not_found":
        case "service_not_found":
          return jsonError(404, "Not found");
        case "slot_unavailable":
          return jsonError(409, "That time is no longer available");
      }
    }

    // The response echoes only what the visitor themselves just supplied, plus an id,
    // the server-computed total, and where to pay.
    return NextResponse.json(
      {
        booking: {
          id: result.booking.id,
          startsAt: result.booking.startsAt,
          status: result.booking.status,
          totalCents: result.booking.totalCents,
        },
        checkoutUrl: result.checkoutUrl,
      },
      {
        status: 201,
        headers: { "x-ratelimit-remaining": String(rate.remaining) },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
