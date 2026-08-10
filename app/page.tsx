import Link from "next/link";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Entry point.
 *
 * This used to list every tenant with its own booking link — the app's only tenant
 * selector. Kasterz is the single business now, so the page goes straight to its
 * booking flow. The branch links below are NOT a tenant selector: they pin an
 * in-branch tablet to Huayacán or Puerto Cancún.
 */
export default async function HomePage() {
  const branches = await db.branch.findMany({
    where: { active: true, slug: { not: null } },
    select: { name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-12 px-6 py-16 sm:px-8">
      <div>
        <p className="eyebrow mb-4 text-gold">Look good, feel good</p>
        <h1 className="display text-4xl leading-none sm:text-5xl">Kasterz</h1>
        <p className="mt-5 text-sm text-muted">
          Barbería, bar y spa en Cancún.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/book"
          className="rounded-full bg-gold px-7 py-3 text-sm font-semibold text-background transition hover:bg-gold-soft"
        >
          Reservar cita
        </Link>

        {branches.map((b) => (
          <Link
            key={b.slug}
            href={`/book?sucursal=${b.slug}`}
            className="rounded-full border border-line px-6 py-3 text-sm text-muted transition hover:border-muted hover:text-foreground"
          >
            Tablet · {b.name}
          </Link>
        ))}
      </div>

      <div className="border-t border-line pt-8">
        <Link
          href="/login"
          className="inline-block rounded-full border border-gold px-6 py-3 text-sm font-semibold text-gold transition hover:bg-gold hover:text-background"
        >
          Entrar al panel
        </Link>
        <p className="mt-4 text-xs text-muted">
          Sin contraseña ni verificación: basta un correo de personal registrado.
        </p>
      </div>
    </main>
  );
}
