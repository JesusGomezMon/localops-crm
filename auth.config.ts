import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration.
 *
 * middleware.ts runs on the Edge runtime, where Prisma cannot run. This half of the
 * config contains no database access — only what is needed to read and validate a
 * JWT. auth.ts spreads this and adds the provider.
 *
 * The `tenantId` that used to travel on the token is gone: there is one business now.
 * `role` stays, because it describes the user, not a tenant.
 */
export const authConfig = {
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  // The provider is added in auth.ts; it needs database access.
  providers: [],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        // Read defensively: a token is attacker-adjacent input, and the JWT interface
        // carries an index signature that types these as unknown.
        session.user.id = typeof token.sub === "string" ? token.sub : "";
        session.user.role = typeof token.role === "string" ? token.role : "staff";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
