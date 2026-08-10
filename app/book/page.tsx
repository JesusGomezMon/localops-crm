import { getBookingPageData } from "@/lib/booking";

import { BookingForm } from "./booking-form";
import { Memberships } from "./memberships";

// Availability changes as bookings arrive, so this page is never cached.
export const dynamic = "force-dynamic";

/** The business this app serves. There is exactly one. */
const BUSINESS_NAME = "Kasterz";

/**
 * The public booking page. No session, no login.
 *
 * This used to live at /book/[tenantSlug] and resolve the business from the URL. With
 * one business the slug carried no information, so the route collapsed to /book.
 *
 * `?sucursal=Huayacan` still pre-selects a BRANCH — that parameter is unrelated to
 * the removed tenant slug and is how the in-branch tablets are pinned to their own
 * location.
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const { sucursal } = await searchParams;
  const data = await getBookingPageData();

  const initialBranch = sucursal
    ? (data.branches.find(
        (b) => b.slug?.toLowerCase() === sucursal.toLowerCase(),
      ) ?? null)
    : null;

  return (
    <main className="mx-auto max-w-xl px-6 pt-12 pb-16 sm:px-8 sm:pt-16">
      <header className="mb-12">
        <p className="eyebrow mb-4 text-gold">Look good, feel good</p>

        <h1 className="display text-4xl leading-none sm:text-5xl">
          {BUSINESS_NAME}
        </h1>

        <p className="mt-5 text-sm text-muted">
          {initialBranch
            ? `Reservando en ${initialBranch.name}.`
            : "Elige sucursal, servicio y horario."}
        </p>
      </header>

      <BookingForm
        branches={data.branches}
        services={data.services}
        memberships={data.memberships}
        initialBranchId={initialBranch?.id ?? null}
      />

      <Memberships memberships={data.memberships} />

      <footer className="mt-14 border-t border-line pt-8">
        <p className="eyebrow mb-4 text-muted">Sucursales</p>
        <div className="flex flex-col gap-5">
          {data.branches.map((branch) => (
            <div key={branch.id} className="text-sm">
              <p className="flex items-center gap-2.5 text-foreground">
                {branch.name}
                {branch.vipOnly ? (
                  <span className="eyebrow text-gold">Solo VIP</span>
                ) : null}
              </p>
              {branch.address ? (
                <p className="mt-1 text-muted">{branch.address}</p>
              ) : null}
              <p className="mt-1 text-muted">
                {[branch.phone, ...branch.hours].filter(Boolean).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}
