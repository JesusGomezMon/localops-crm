import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing.
 *
 * scrypt from `node:crypto` — no new dependency, and it is a memory-hard KDF, so a
 * stolen database is expensive to crack rather than a lookup table away.
 *
 * Stored format: `scrypt$<salt hex>$<hash hex>`. The scheme prefix means a future
 * change of algorithm can be detected and migrated instead of silently mis-verifying.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Constant-time verification.
 *
 * `timingSafeEqual` rather than `===`: a short-circuiting comparison leaks how many
 * leading bytes were correct, which is enough to recover a hash byte by byte.
 *
 * Returns false for anything malformed rather than throwing, so a corrupt row denies
 * access instead of crashing the sign-in route.
 */
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) {
    return false;
  }

  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }

  if (expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

/**
 * The password the seed installs when nothing else is configured.
 *
 * Deliberately weak and deliberately well-known: it exists so a fresh clone can sign
 * in without ceremony. `assertPasswordSafeForProduction()` in auth.ts refuses to boot
 * a production build that still uses it.
 */
export const DEFAULT_ADMIN_PASSWORD = "admin123";
export const DEFAULT_ADMIN_USERNAME = "admin";

/** Resolve the seed password: `ADMIN_PASSWORD` if set, otherwise the default. */
export function seedAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
}
