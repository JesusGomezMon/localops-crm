import Link from "next/link";

import { db, requireStaff } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getDashboardStats, getMembershipRequests } from "@/lib/reporting";

import { activateMembership } from "./actions";

export const dynamic = "force-dynamic";

// No tenant filter appears in this file. The client from getTenantDb() cannot read
// another business's rows, so every figure below is already scoped.
export default async function DashboardPage() {
  await requireStaff();
  const [stats, requests] = await Promise.all([
    getDashboardStats(db),
    getMembershipRequests(db),
  ]);

  const pending = requests.filter((r) => r.status === "solicitada");

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="eyebrow text-gold">Resumen</p>
        <h1 className="display mt-3 text-3xl">Tu negocio hoy</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Ingresos del mes"
          value={formatMoney(stats.revenue.monthCents)}
          hint={`${formatMoney(stats.revenue.todayCents)} hoy`}
          accent
        />
        <Stat
          label="Citas hoy"
          value={String(stats.appointments.today)}
          hint={`${stats.appointments.upcoming} próximas`}
        />
        <Stat
          label="Membresías activas"
          value={String(stats.memberships.active)}
          hint={`${formatMoney(stats.memberships.monthlyRecurringCents)} recurrente`}
        />
        <Stat
          label="Clientes"
          value={String(stats.customers.total)}
          hint={`+${stats.customers.newThisMonth} este mes`}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Por confirmar"
          value={String(stats.appointments.pending)}
          hint={`${formatMoney(stats.revenue.pendingCents)} sin confirmar`}
        />
        <Stat
          label="Completadas este mes"
          value={String(stats.appointments.monthCompleted)}
        />
        <Stat
          label="Membresías nuevas"
          value={String(stats.memberships.newThisMonth)}
          hint={`${stats.memberships.requested} por atender`}
        />
      </section>

      <section>
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="eyebrow text-foreground">Solicitudes de membresía</h2>
            <p className="mt-2 text-sm text-muted">
              Clientes que iniciaron la compra de una membresía.
            </p>
          </div>
          <Link
            href="/dashboard/agenda"
            className="shrink-0 text-sm text-gold hover:underline"
          >
            Ver agenda →
          </Link>
        </div>

        {requests.length === 0 ? (
          <p className="card-surface p-8 text-center text-sm text-muted">
            Todavía nadie pidió una membresía desde la página de reservas.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="card-surface flex flex-wrap items-center gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2.5">
                    <span className="truncate">{r.customer.name}</span>
                    <span className="eyebrow text-gold">
                      {r.membership.name}
                    </span>
                    {r.status === "activa" ? (
                      <span className="text-xs text-emerald-400">activa</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {r.customer.phone ?? r.customer.email} · iba a pagar{" "}
                    {formatMoney(r.quotedTotalCents)} ·{" "}
                    {r.requestedAt.toLocaleDateString("es-MX")}
                  </p>
                </div>

                <p className="shrink-0 text-sm tabular-nums">
                  {formatMoney(r.membership.priceCents)}/mes
                </p>

                {r.status === "solicitada" ? (
                  <form action={activateMembership} className="shrink-0">
                    <input type="hidden" name="membershipRequestId" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-background transition hover:bg-gold-soft"
                    >
                      Activar
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {pending.length > 0 ? (
          <p className="mt-4 text-xs text-muted">
            Activar sólo marca la membresía como vendida para el reporte. El cobro
            recurrente todavía no está conectado.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card-surface p-5">
      <p className="eyebrow text-muted">{label}</p>
      <p
        className={`display mt-3 text-2xl tabular-nums ${accent ? "text-gold" : ""}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
