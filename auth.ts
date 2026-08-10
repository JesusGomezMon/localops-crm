import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import {
  DEFAULT_ADMIN_PASSWORD,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Staff sign-in: username and password. Nothing is ever emailed.
 *
 * This replaces the credential-free sign-in that preceded it, which admitted anyone
 * who knew a staff address — threat S1 in docs/threat-model.md, and the top finding
 * of the Phase 1 review.
 *
 * Three further findings from that review are handled here:
 *   S2/D5 — sign-in attempts are rate limited per username
 *   S4    — unknown user and wrong password give the identical answer
 *   E4    — production refuses to boot on the shipped default password
 */

/** Rank 2 in the threat model: without this, the password is a speed bump. */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 5 * 60_000;

/**
 * Threat E4. `admin123` exists so a fresh clone can sign in; it must never be what
 * guards real customer data, so a production build with it still in place refuses to
 * start rather than quietly serving.
 */
function assertPasswordSafeForProduction(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const configured = process.env.ADMIN_PASSWORD?.trim();

  if (!configured || configured === DEFAULT_ADMIN_PASSWORD) {
    throw new Error(
      "Refusing to start: the staff panel is still using the default password. " +
        "Set ADMIN_PASSWORD to something else and re-seed before deploying.",
    );
  }

  if (!process.env.AUTH_SECRET) {
    throw new Error("Refusing to start: AUTH_SECRET is not set.");
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  assertPasswordSafeForProduction();

  return {
    ...authConfig,

    // No adapter: sessions are JWTs. There is no Account, Session or
    // VerificationToken table, because nothing is emailed and nothing is verified.
    providers: [
      Credentials({
        name: "Usuario y contraseña",
        credentials: {
          username: { label: "Usuario", type: "text" },
          password: { label: "Contraseña", type: "password" },
        },

        async authorize(credentials) {
          const username = String(credentials?.username ?? "")
            .trim()
            .toLowerCase();
          const password = String(credentials?.password ?? "");

          if (!username || !password) {
            return null;
          }

          // Keyed on username rather than IP: the attacker picking the target is the
          // one worth slowing down, and an IP is trivially rotated.
          const rate = checkRateLimit(
            `login:${username}`,
            LOGIN_LIMIT,
            LOGIN_WINDOW_MS,
          );
          if (!rate.ok) {
            console.warn("[auth] rate limited sign-in attempts for a username");
            return null;
          }

          const user = await db.user.findUnique({
            where: { username },
            select: {
              id: true,
              username: true,
              name: true,
              email: true,
              role: true,
              passwordHash: true,
            },
          });

          // Threat S4: an unknown username must cost the same as a wrong password,
          // or the timing difference tells an attacker which names are real. Hashing
          // a throwaway value keeps both branches doing the same work.
          if (!user?.passwordHash) {
            hashPassword(password);
            return null;
          }

          if (!verifyPassword(password, user.passwordHash)) {
            return null;
          }

          return {
            id: user.id,
            name: user.name ?? user.username,
            email: user.email ?? undefined,
            role: user.role,
          };
        },
      }),
    ],
  };
});
