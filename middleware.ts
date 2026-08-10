import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

/**
 * Edge middleware: the session gate for staff areas.
 *
 * The tenant-conflict checks that used to live here are gone with the tenant system.
 * What remains is the redirect for unauthenticated visitors.
 *
 * Be clear about what this now protects: sign-in verifies nothing (see auth.ts), so
 * this stops someone who has not signed in, not someone who should not be able to.
 */
const { auth } = NextAuth(authConfig);

const STAFF_API_PREFIXES = [
  "/api/customers",
  "/api/appointments",
  "/api/services",
];

function isStaffArea(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    STAFF_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export default auth((request) => {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;

  if (!isStaffArea(pathname)) {
    return NextResponse.next();
  }

  if (!request.auth?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Public routes (/, /book, /api/public/*, /api/auth/*) are intentionally absent:
  // the booking flow must work with no session at all.
  matcher: [
    "/dashboard/:path*",
    "/api/customers/:path*",
    "/api/appointments/:path*",
    "/api/services/:path*",
  ],
};
