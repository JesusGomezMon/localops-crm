/**
 * In-memory fixed-window rate limiter.
 *
 * Deliberately dependency-free, and deliberately limited: state lives in this
 * process's heap, so it resets on restart and is not shared between instances. Behind
 * more than one container, an attacker gets `limit × instances` attempts. That is
 * acceptable for a scaffold and for single-instance deployments; it is NOT a
 * production control at scale. Swap in @upstash/ratelimit (or any shared store) and
 * keep this module's signature — see README "What to plug in for production".
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

/** Drop expired buckets so a stream of unique keys cannot grow the map without bound. */
function sweep(now: number): void {
  if (buckets.size < 1000) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      ok: true,
      limit,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );

  return {
    ok: existing.count <= limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds,
  };
}

/** Test-only: clears all buckets so cases cannot leak counts into each other. */
export function resetRateLimits(): void {
  buckets.clear();
}

export function bookingRateLimitConfig(): { limit: number; windowMs: number } {
  return {
    limit: Number(process.env.BOOKING_RATE_LIMIT ?? 5),
    windowMs: Number(process.env.BOOKING_RATE_WINDOW_MS ?? 60_000),
  };
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is client-controllable unless a trusted proxy overwrites it, so
 * this is only trustworthy when the app sits behind a proxy that does. Deployed
 * naked to the internet, an attacker can rotate the header and defeat the limit
 * entirely. Flagged in the README threat model rather than papered over.
 *
 * Requests with no forwarding header share a single "unknown" bucket, which throttles
 * them collectively rather than letting them through unlimited.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}
