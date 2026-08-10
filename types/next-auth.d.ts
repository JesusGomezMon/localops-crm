import type { DefaultSession } from "next-auth";

// `tenantId` was removed with the tenant system. `role` remains: it describes the
// user, not a business boundary.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}

export {};
