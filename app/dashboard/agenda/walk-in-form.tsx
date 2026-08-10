"use client";

import { useMemo, useState, useTransition } from "react";

import { createWalkIn } from "../actions";
import { isAvailableAtBranch } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";

type Branch = { id: string; name: string; vipOnly: boolean };
type Service = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  tier: string;
};

/**
 * Register a booking taken at the counter.
 *
 * The slot then disappears from the public calendar for exactly the same reason any
 * other appointment does — there is no separate "blocked" concept to keep in sync,
 * and the business keeps the booking in its history rather than a nameless hole.
 */
export function WalkInForm({
  branches,
  services,
}: {
  branches: Branch[];
  services: Service[];
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  const branch = branches.find((b) => b.id === branchId) ?? null;

  // Narrowed by the same predicate the public flow and the server action use, so the
  // three can never disagree about what a branch sells.
  const availableServices = useMemo(
    () => (branch ? services.filter((s) => isAvailableAtBranch(s, branch)) : services),
    [services, branch],
  );

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createWalkIn(formData);
      if (result.ok) {
        setMessage("Cita registrada. El horario ya no aparece en línea.");
        setOpen(false);
      } else {
        setMessage(result.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage(null);
          }}
          className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-background transition hover:bg-gold-soft"
        >
          Bloquear horario / cita presencial
        </button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </div>
    );
  }

  return (
    <form action={onSubmit} className="card-surface p-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="eyebrow text-foreground">Cita presencial</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          Cerrar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Sucursal</span>
          <select
            name="branchId"
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.vipOnly ? " · solo VIP" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Servicio</span>
          <select
            name="serviceId"
            required
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold"
          >
            {availableServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {formatMoney(s.priceCents)} ({s.durationMin} min)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Fecha y hora</span>
          <input
            type="datetime-local"
            name="startsAt"
            required
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Cliente</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Nombre"
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Teléfono (opcional)</span>
          <input
            name="phone"
            maxLength={40}
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="eyebrow text-muted">Correo (opcional)</span>
          <input
            name="email"
            type="email"
            maxLength={200}
            className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold"
          />
        </label>
      </div>

      {message ? <p className="mt-4 text-sm text-danger">{message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-full bg-gold px-6 py-3 text-sm font-semibold text-background transition hover:bg-gold-soft disabled:opacity-40 sm:w-auto sm:px-10"
      >
        {pending ? "Guardando…" : "Bloquear horario"}
      </button>
    </form>
  );
}
