/**
 * Staff sign-in.
 *
 * Written against the findings in docs/threat-model.md rather than against the
 * implementation: S1 (no credential), S2/D5 (no rate limit on sign-in), S4 (the login
 * page distinguished "unknown user" from "wrong password"), E4 (default password
 * reaching production).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ADMIN_PASSWORD,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import { resetRateLimits } from "@/lib/rate-limit";
import { rawPrisma, resetAndSeed } from "./helpers/fixtures";

beforeEach(async () => {
  await resetAndSeed();
  resetRateLimits();
});

describe("password hashing", () => {
  it("never stores the password itself", () => {
    const stored = hashPassword("admin123");

    expect(stored).not.toContain("admin123");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("produces a different hash each time, so equal passwords are not equal rows", () => {
    // A shared salt would let anyone spot two accounts using the same password.
    expect(hashPassword("admin123")).not.toBe(hashPassword("admin123"));
  });

  it("accepts the right password and rejects everything else", () => {
    const stored = hashPassword("admin123");

    expect(verifyPassword("admin123", stored)).toBe(true);
    expect(verifyPassword("admin124", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
    expect(verifyPassword("ADMIN123", stored)).toBe(false);
  });

  it("refuses malformed or missing hashes instead of throwing", () => {
    // A corrupt row must deny access, not crash the sign-in route.
    expect(verifyPassword("admin123", null)).toBe(false);
    expect(verifyPassword("admin123", "")).toBe(false);
    expect(verifyPassword("admin123", "plaintext-password")).toBe(false);
    expect(verifyPassword("admin123", "md5$aa$bb")).toBe(false);
    expect(verifyPassword("admin123", "scrypt$notahexsalt$short")).toBe(false);
  });
});

describe("the seeded admin account", () => {
  it("exists with a hashed password, not a plaintext one", async () => {
    const admin = await rawPrisma.user.findUnique({
      where: { username: "admin" },
      select: { passwordHash: true, role: true },
    });

    expect(admin).not.toBeNull();
    expect(admin!.passwordHash).toMatch(/^scrypt\$/);
    expect(admin!.passwordHash).not.toContain(DEFAULT_ADMIN_PASSWORD);
    expect(admin!.role).toBe("owner");
  });

  it("verifies against the documented default", async () => {
    const admin = await rawPrisma.user.findUniqueOrThrow({
      where: { username: "admin" },
      select: { passwordHash: true },
    });

    expect(verifyPassword(DEFAULT_ADMIN_PASSWORD, admin.passwordHash)).toBe(true);
    expect(verifyPassword("wrong", admin.passwordHash)).toBe(false);
  });

  it("leaves no account that can sign in without a password", async () => {
    // Threat S1 in its original form: rows carried over from the credential-free
    // schema had no hash at all.
    const passwordless = await rawPrisma.user.count({
      where: { passwordHash: null },
    });

    expect(passwordless).toBe(0);
  });
});

describe("sign-in rate limiting (threats S2, D5)", () => {
  it("stops after the configured number of attempts against one username", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const results: boolean[] = [];
    for (let i = 0; i < 7; i += 1) {
      results.push(checkRateLimit("login:admin", 5, 5 * 60_000).ok);
    }

    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results.slice(5)).toEqual([false, false]);
  });

  it("counts each username separately, so one lockout is not a global outage", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");

    for (let i = 0; i < 6; i += 1) {
      checkRateLimit("login:admin", 5, 5 * 60_000);
    }

    expect(checkRateLimit("login:otro", 5, 5 * 60_000).ok).toBe(true);
  });
});

describe("nothing is sent by email", () => {
  it("keeps no verification token, account or session table", async () => {
    const client = rawPrisma as unknown as Record<string, unknown>;

    expect(client.verificationToken).toBeUndefined();
    expect(client.account).toBeUndefined();
    expect(client.session).toBeUndefined();
  });

  it("does not depend on a mail transport", async () => {
    const pkg = await import("../package.json");
    const deps = {
      ...(pkg.default.dependencies ?? {}),
      ...(pkg.default.devDependencies ?? {}),
    } as Record<string, string>;

    expect(deps.nodemailer).toBeUndefined();
    expect(deps["@auth/prisma-adapter"]).toBeUndefined();
  });
});
