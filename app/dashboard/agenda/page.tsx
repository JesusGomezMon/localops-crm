import { db, requireStaff } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getUpcomingAppointments } from "@/lib/reporting";

import { cancelAppointment, confirmAppointment } from "../actions";
import { WalkInForm } from "./walk-in-form";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  public: "en línea",
  kiosk: "tablet",
  walkin: "presencial",
  staff: "recepción",
};

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const timeFormat = new Intl.DateTimeFormat("es-MX", {
  hour: "numeric",
  minute: "2-digit",
});

export default async function AgendaPage() {
  await requireStaff();

  const [appointments, branches, services] = await Promise.all([
    getUpcomingAppointments(db),
    db.branch.findMany({
      where: { active: true },
      select: { id: true, name: true, vipOnly: true },
      orderBy: { name: "asc" },
    }),
    // `tier` travels to the form so the service list narrows with the chosen branch,
    // instead of offering something the server will then refuse.
    db.service.findMany({
      where: { active: true, kind: { not: "extra" } },
      select: {
        id: true,
        name: true,
        durationMin: true,
        priceCents: true,
        tier: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const live = appointments.filter((a) => a.status !== "cancelled");

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="eyebrow text-gold">Agenda</p>
        <h1 className="display mt-3 text-3xl">Reservas</h1>
        <p className="mt-3 text-sm text-muted">
          {live.length} cita(s) activas. Cancelar libera el horario en la página
          pública de inmediato.
        </p>
      </div>

      {/* Blocking a slot taken at the counter is the whole reason this form exists. */}
      <WalkInForm branches={branches} services={services} />

      {appointments.length === 0 ? (
        <p className="card-surface p-10 text-center text-muted">
          No hay citas próximas.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {appointments.map((a) => {
            const cancelled = a.status === "cancelled";
            return (
              <div
                key={a.id}
                className={`card-surface flex flex-wrap items-center gap-4 p-4 ${
                  cancelled ? "opacity-40" : ""
                }`}
              >
                <div className="w-28 shrink-0">
                  <p className="text-sm capitalize tabular-nums">
                    {dateFormat.format(a.startsAt)}
                  </p>
                  <p className="display text-base tabular-nums text-gold">
                    {timeFormat.format(a.startsAt)}
                  </p>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {a.customer.name}
                    {a.customer.phone ? (
                      <span className="text-muted"> · {a.customer.phone}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {a.service.name} · {a.branch.name} ·{" "}
                    {SOURCE_LABEL[a.source] ?? a.source}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </p>
                </div>

                <p className="shrink-0 text-sm tabular-nums">
                  {formatMoney(a.totalCents)}
                </p>

                <span
                  className={`shrink-0 text-xs ${
                    a.status === "pending"
                      ? "text-gold"
                      : a.status === "cancelled"
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {a.status}
                </span>

                {!cancelled ? (
                  <div className="flex shrink-0 gap-2">
                    {a.status === "pending" ? (
                      <form action={confirmAppointment}>
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <button
                          type="submit"
                          className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-background transition hover:bg-gold-soft"
                        >
                          Confirmar
                        </button>
                      </form>
                    ) : null}

                    <form action={cancelAppointment}>
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-line px-4 py-2 text-xs text-muted transition hover:border-danger hover:text-danger"
                      >
                        Cancelar
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
