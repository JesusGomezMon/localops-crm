"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";
import type { PublicMembership } from "@/lib/booking";

/**
 * Membership tiers below the booking flow. Each tier has a buy button that
 * collects contact details (if needed) and sends the visitor to Stripe.
 */
export function Memberships({ memberships }: { memberships: PublicMembership[] }) {
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (memberships.length === 0) {
    return null;
  }

  async function buy(
    membershipId: string,
    contact: { name: string; email: string; phone: string },
  ) {
    setError(null);
    setDone(null);
    setBuyingId(membershipId);

    try {
      const response = await fetch("/api/public/membership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId, ...contact }),
      });

      if (!response.ok) {
        setError(
          response.status === 422
            ? "Revisa nombre, correo y teléfono."
            : "No pudimos iniciar la compra.",
        );
        return;
      }

      const body = (await response.json()) as {
        checkoutUrl: string | null;
        membershipName: string;
      };

      if (body.checkoutUrl) {
        window.location.assign(body.checkoutUrl);
        return;
      }

      setDone(`Listo — te confirmamos tu ${body.membershipName} en sucursal.`);
      setOpenId(null);
    } catch {
      setError("No pudimos iniciar la compra.");
    } finally {
      setBuyingId(null);
    }
  }

  return (
    <section className="mt-4 border-t border-line pt-14">
      <div className="mb-8">
        <p className="eyebrow mb-3 text-muted">Membresías</p>
        <h2 className="display text-2xl leading-tight">
          Visita seguido y paga menos
        </h2>
      </div>

      <div className="divide-y divide-line">
        {memberships.map((m) => {
          const open = openId === m.id;
          const busy = buyingId === m.id;

          return (
            <article key={m.id} className="py-7">
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h3 className="flex items-center gap-3 text-lg text-foreground">
                  {m.name}
                  {m.highlight ? (
                    <span className="eyebrow text-gold">Más elegida</span>
                  ) : null}
                </h3>

                <div className="shrink-0 text-right">
                  <span className="text-lg tabular-nums text-foreground">
                    {formatMoney(m.priceCents)}
                  </span>
                  <span className="text-sm text-muted">/mes</span>
                </div>
              </div>

              {m.savingsCents ? (
                <p className="mb-4 text-[0.8125rem] text-gold">
                  Ahorras {formatMoney(m.savingsCents)} vs. precio estándar
                </p>
              ) : null}

              <ul className="flex flex-col gap-1.5">
                {m.benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex gap-3 text-[0.9375rem] text-muted"
                  >
                    <span className="mt-2 h-px w-3 shrink-0 bg-line" />
                    {benefit}
                  </li>
                ))}
              </ul>

              {m.plans.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {m.plans.map((plan) => (
                    <span
                      key={plan}
                      className="border border-line px-3 py-1 text-xs text-muted"
                    >
                      {plan}
                    </span>
                  ))}
                </div>
              ) : null}

              {open ? (
                <form
                  className="mt-5 flex flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void buy(m.id, {
                      name: String(form.get("name") ?? "").trim(),
                      email: String(form.get("email") ?? "").trim(),
                      phone: String(form.get("phone") ?? "").trim(),
                    });
                  }}
                >
                  <input
                    name="name"
                    required
                    maxLength={120}
                    placeholder="Nombre"
                    autoComplete="name"
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-gold"
                  />
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={200}
                    placeholder="Correo"
                    autoComplete="email"
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-gold"
                  />
                  <input
                    name="phone"
                    type="tel"
                    required
                    maxLength={40}
                    placeholder="Teléfono"
                    autoComplete="tel"
                    className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-gold"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="touch-target rounded-full bg-gold px-6 py-3 text-sm font-semibold text-background transition hover:bg-gold-soft disabled:opacity-40"
                  >
                    {busy ? "Procesando…" : `Pagar ${formatMoney(m.priceCents)}`}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setOpenId(m.id);
                  }}
                  className="touch-target mt-5 rounded-full border border-line px-6 py-3 text-sm font-semibold text-foreground transition hover:border-gold hover:text-gold"
                >
                  Comprar
                </button>
              )}
            </article>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? <p className="mt-4 text-sm text-gold">{done}</p> : null}

      <p className="mt-6 text-xs text-muted">
        Vigencia de 30 días, no acumulable. Cancelación con mínimo 7 días de aviso.
        Sin reembolso por servicios no utilizados.
      </p>
    </section>
  );
}
