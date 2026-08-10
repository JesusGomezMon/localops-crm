import Link from "next/link";

import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  async function endSession() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
          <Link href="/dashboard" className="display text-lg">
            Kasterz
          </Link>

          <nav className="flex gap-5 text-sm text-muted">
            <Link href="/dashboard" className="transition hover:text-foreground">
              Resumen
            </Link>
            <Link
              href="/dashboard/agenda"
              className="transition hover:text-foreground"
            >
              Agenda
            </Link>
            <Link
              href="/dashboard/customers"
              className="transition hover:text-foreground"
            >
              Clientes
            </Link>
            <Link
              href="/dashboard/services"
              className="transition hover:text-foreground"
            >
              Servicios
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">
              {session?.user?.name}
            </span>
            <form action={endSession}>
              <button
                type="submit"
                className="rounded-full border border-line px-4 py-2 text-xs text-muted transition hover:border-muted hover:text-foreground"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
