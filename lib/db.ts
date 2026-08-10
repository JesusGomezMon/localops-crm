import { PrismaClient } from "@prisma/client";

/**
 * The database client.
 *
 * This file used to hold a tenant-scoping wrapper: every query was rewritten to
 * filter by `tenantId`, injected from the session or a URL slug. Kasterz is the only
 * business, so that boundary had one side and has been removed along with the column.
 *
 * WHAT THIS DOES NOT AFFECT: branch scoping. Huayacán and Puerto Cancún are a
 * different axis — they were never enforced here. Each branch's calendar comes from
 * `branchId` filters in lib/availability.ts, and the VIP tier rule lives in
 * lib/catalog.ts. Both are untouched.
 */
const globalForPrisma = globalThis as unknown as { db?: PrismaClient };

export const db: PrismaClient = globalForPrisma.db ?? new PrismaClient();

// Next.js dev server hot-reloads modules; without this each reload leaks a
// connection pool until SQLite starts refusing new handles.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db;
}

/**
 * Client type for functions that take a database handle. Replaces the old `TenantDb`,
 * which was the return type of the scoping factory.
 */
export type Db = PrismaClient;

/** Raised when a staff-only path is reached without a session. */
export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Gate for staff routes and server actions.
 *
 * Returns the signed-in user, or throws `UnauthorizedError` — which route handlers
 * map to 401 via `handleRouteError()` in lib/api.ts.
 *
 * NOTE ON WHAT A SESSION NOW PROVES: nothing about identity. Sign-in accepts any
 * known staff email with no password and no emailed link, so this checks only that
 * *someone* typed a valid address. See the warning block in auth.ts.
 */
export async function requireStaff(): Promise<{
  id: string;
  name: string;
  role: string;
}> {
  // Imported lazily so the public booking path does not pull the auth stack into its
  // module graph.
  const { auth } = await import("@/auth");
  const session = await auth();
  const user = session?.user;

  // Keyed on the user id, not the email: staff sign in with a username and may have
  // no address at all now that nothing is emailed. Checking `email` here rejected
  // every valid session.
  if (!user?.id) {
    throw new UnauthorizedError();
  }

  return {
    id: user.id,
    name: user.name ?? "",
    role: user.role ?? "staff",
  };
}
