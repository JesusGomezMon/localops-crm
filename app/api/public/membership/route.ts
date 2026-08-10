import { NextResponse, type NextRequest } from "next/server";

import { handleRouteError, jsonError, readJson } from "@/lib/api";
import { purchaseMembership } from "@/lib/booking";
import {
  bookingRateLimitConfig,
  checkRateLimit,
  clientIpFrom,
} from "@/lib/rate-limit";
import { publicMembershipPurchaseSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Public membership purchase — same rate limit bucket shape as booking. */
export async function POST(request: NextRequest) {
  try {
    const { limit, windowMs } = bookingRateLimitConfig();
    const ip = clientIpFrom(request.headers);
    const rate = checkRateLimit(`membership:${ip}`, limit, windowMs);

    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again shortly." },
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

    const body = await readJson(request);
    const input = publicMembershipPurchaseSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      origin: request.nextUrl.origin,
    });

    const result = await purchaseMembership(input);

    if (!result.ok) {
      return jsonError(404, "Not found");
    }

    return NextResponse.json(
      {
        requestId: result.requestId,
        membershipName: result.membershipName,
        priceCents: result.priceCents,
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
