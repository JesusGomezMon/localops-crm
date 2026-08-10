"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Calendar } from "./calendar";
import { MembershipUpsell } from "./upsell";
import {
  computeTotalCents,
  groupByCategory,
  visibleCatalog,
  type CatalogItem,
  type MembershipLike,
} from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import type { PublicBranch } from "@/lib/booking";

type Props = {
  branches: PublicBranch[];
  services: CatalogItem[];
  memberships: MembershipLike[];
  /** Branch pre-selected from ?sucursal=, for in-branch tablets. */
  initialBranchId: string | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "booked"; startsAt: string; totalCents: number; paid: boolean }
  | { kind: "error"; message: string };

const timeFormat = new Intl.DateTimeFormat("es-MX", {
  hour: "numeric",
  minute: "2-digit",
});

const longDateFormat = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function monthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * One flow, two contexts.
 *
 * There is no separate kiosk build. A tablet in the branch arrives with ?sucursal=
 * already set so it starts a step further along, and coarse-pointer media queries
 * enlarge the targets. Everything else — filtering, pricing, availability, checkout —
 * is the same code a customer runs on their phone at home.
 */
export function BookingForm({
  branches,
  services,
  memberships,
  initialBranchId,
}: Props) {
  const [branchId, setBranchId] = useState(
    initialBranchId ?? (branches.length === 1 ? branches[0].id : ""),
  );
  const [serviceId, setServiceId] = useState("");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [buyingMembership, setBuyingMembership] = useState(false);
  const [membershipNote, setMembershipNote] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [monthData, setMonthData] = useState({
    key: "",
    days: {} as Record<string, number>,
  });
  const [dayData, setDayData] = useState({ key: "", slots: [] as string[] });

  const branch = branches.find((b) => b.id === branchId) ?? null;

  // THE branch filter, applied through the same function the server uses to refuse a
  // booking. At Puerto Cancún this drops every Básico service and non-VIP package;
  // extras and spa are "universal" and survive at every branch.
  const catalog = useMemo(
    () => (branch ? visibleCatalog(services, branch) : { primary: [], extras: [] }),
    [services, branch],
  );

  const service = catalog.primary.find((s) => s.id === serviceId) ?? null;
  const selectedExtras = catalog.extras.filter((e) => extraIds.includes(e.id));
  const totalCents = computeTotalCents(service, selectedExtras);

  const ready = Boolean(branchId && serviceId);
  const monthKey = ready ? `${branchId}|${serviceId}|${monthParam(month)}` : "";
  const dayKey = ready && day ? `${branchId}|${serviceId}|${day}` : "";

  const availability = monthData.key === monthKey ? monthData.days : {};
  const slots = dayKey && dayData.key === dayKey ? dayData.slots : [];
  const loadingMonth = Boolean(monthKey) && monthData.key !== monthKey;
  const loadingSlots = Boolean(dayKey) && dayData.key !== dayKey;

  const query = useCallback(
    (extra: Record<string, string>) =>
      new URLSearchParams({ branchId, serviceId, ...extra }).toString(),
    [branchId, serviceId],
  );

  useEffect(() => {
    if (!monthKey) return;
    let cancelled = false;

    fetch(`/api/public/availability?${query({ month: monthParam(month) })}`)
      .then((r) => (r.ok ? r.json() : { days: {} }))
      .then((body: { days?: Record<string, number> }) => {
        if (!cancelled) setMonthData({ key: monthKey, days: body.days ?? {} });
      })
      .catch(() => {
        if (!cancelled) setMonthData({ key: monthKey, days: {} });
      });

    return () => {
      cancelled = true;
    };
  }, [monthKey, month, query]);

  useEffect(() => {
    if (!dayKey || !day) return;
    let cancelled = false;

    fetch(`/api/public/availability?${query({ date: day })}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((body: { slots?: string[] }) => {
        if (!cancelled) setDayData({ key: dayKey, slots: body.slots ?? [] });
      })
      .catch(() => {
        if (!cancelled) setDayData({ key: dayKey, slots: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [dayKey, day, query]);

  function selectBranch(id: string) {
    setBranchId(id);
    // A service that exists at Huayacán may not exist at Puerto Cancún, so the
    // downstream selection is cleared rather than left pointing at a hidden item.
    setServiceId("");
    setExtraIds([]);
    setDay(null);
    setSlot(null);
  }

  function toggleExtra(id: string) {
    setExtraIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot) return;

    setStatus({ kind: "sending" });
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/public/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branchId,
        serviceId,
        // Ids only. The total shown here is a preview; the server prices the booking
        // from its own rows.
        extraIds,
        startsAt: slot,
        source: initialBranchId ? "kiosk" : "public",
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone"),
      }),
    });

    if (response.status === 201) {
      const body = (await response.json()) as {
        booking: { startsAt: string; totalCents: number };
        checkoutUrl: string | null;
      };

      // Stripe hosts the payment page; leaving the site is the point.
      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }

      setStatus({
        kind: "booked",
        startsAt: body.booking.startsAt,
        totalCents: body.booking.totalCents,
        paid: false,
      });
      return;
    }

    const messages: Record<number, string> = {
      409: "Ese horario se acaba de ocupar. Elige otro.",
      422: "Revisa los datos del formulario.",
      429: "Demasiados intentos. Espera un momento.",
      404: "Ese servicio no está disponible en esta sucursal.",
    };

    setStatus({
      kind: "error",
      message: messages[response.status] ?? "No pudimos completar la reserva.",
    });

    if (response.status === 409 && day && dayKey) {
      setSlot(null);
      fetch(`/api/public/availability?${query({ date: day })}`)
        .then((r) => (r.ok ? r.json() : { slots: [] }))
        .then((b: { slots?: string[] }) =>
          setDayData({ key: dayKey, slots: b.slots ?? [] }),
        )
        .catch(() => {});
    }
  }

  async function buyMembership(membershipId: string) {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();

    if (!name || !email || !phone) {
      setMembershipNote(null);
      setStatus({
        kind: "error",
        message: "Llena nombre, correo y teléfono para comprar la membresía.",
      });
      const firstEmpty =
        (!name && form.elements.namedItem("name")) ||
        (!email && form.elements.namedItem("email")) ||
        form.elements.namedItem("phone");
      if (firstEmpty instanceof HTMLElement) firstEmpty.focus();
      return;
    }

    setBuyingMembership(true);
    setMembershipNote(null);
    setStatus({ kind: "idle" });

    try {
      const response = await fetch("/api/public/membership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId, name, email, phone }),
      });

      if (!response.ok) {
        setStatus({
          kind: "error",
          message:
            response.status === 422
              ? "Revisa nombre, correo y teléfono."
              : "No pudimos iniciar la compra de la membresía.",
        });
        return;
      }

      const body = (await response.json()) as {
        checkoutUrl: string | null;
        membershipName: string;
      };

      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }

      setMembershipNote(
        `Solicitud de ${body.membershipName} registrada. Te confirmamos el pago en sucursal.`,
      );
    } catch {
      setStatus({
        kind: "error",
        message: "No pudimos iniciar la compra de la membresía.",
      });
    } finally {
      setBuyingMembership(false);
    }
  }

  if (status.kind === "booked") {
    const when = new Date(status.startsAt);
    return (
      <div className="card-surface p-8">
        <p className="eyebrow text-gold">Cita apartada</p>
        <h2 className="display mt-4 text-2xl">
          <span className="capitalize">{longDateFormat.format(when)}</span> ·{" "}
          {timeFormat.format(when)}
        </h2>
        <p className="mt-5 border-t border-line pt-5 text-lg tabular-nums">
          Total {formatMoney(status.totalCents)}
        </p>
        <p className="mt-2 text-sm text-muted">
          Pago pendiente en sucursal. Te confirmamos por teléfono o correo.
        </p>
      </div>
    );
  }

  const step = (n: number) => n + (branches.length > 1 ? 1 : 0);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="pb-40">
      {branches.length > 1 ? (
        <Section step={1} title="Sucursal">
          <div className="flex flex-col gap-3">
            {branches.map((b) => (
              <Card
                key={b.id}
                name={b.name}
                selected={branchId === b.id}
                onClick={() => selectBranch(b.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="display text-base">{b.name}</span>
                  {b.vipOnly ? (
                    <span className="eyebrow shrink-0 text-gold">Solo VIP</span>
                  ) : null}
                </div>
                {b.address ? (
                  <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
                    {b.address}
                  </p>
                ) : null}
                {b.amenities.length > 0 ? (
                  <p className="mt-2 text-xs text-muted">
                    {b.amenities.join(" · ")}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {branch ? (
        <Section
          step={step(1)}
          title="Servicio"
          hint={branch.vipOnly ? "Catálogo VIP" : undefined}
        >
          <div className="flex flex-col gap-7">
            {groupByCategory(catalog.primary).map(([category, items]) => (
              <div key={category}>
                <p className="eyebrow mb-3 text-muted">{category}</p>
                <div className="flex flex-col gap-2">
                  {items.map((s) => (
                    <Row
                      key={s.id}
                      selected={serviceId === s.id}
                      onClick={() => {
                        setServiceId(s.id);
                        setDay(null);
                        setSlot(null);
                      }}
                      title={s.name}
                      subtitle={`${s.durationMin} min`}
                      price={formatMoney(s.priceCents)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {serviceId && catalog.extras.length > 0 ? (
        <Section
          step={step(2)}
          title="Extras"
          hint={extraIds.length > 0 ? `${extraIds.length} agregados` : "opcional"}
        >
          <div className="flex flex-col gap-2">
            {catalog.extras.map((e) => (
              <Row
                key={e.id}
                selected={extraIds.includes(e.id)}
                onClick={() => toggleExtra(e.id)}
                title={e.name}
                subtitle={`${e.durationMin} min`}
                price={`+ ${formatMoney(e.priceCents)}`}
                multi
              />
            ))}
          </div>
        </Section>
      ) : null}

      {serviceId ? (
        <Section step={step(3)} title="Fecha">
          <Calendar
            month={month}
            onMonthChange={setMonth}
            selected={day}
            onSelect={(next) => {
              setDay(next);
              setSlot(null);
            }}
            availability={availability}
            loading={loadingMonth}
          />
        </Section>
      ) : null}

      {day ? (
        <Section
          step={step(4)}
          title="Hora"
          hint={slots.length > 0 ? `${slots.length} libres` : undefined}
        >
          {loadingSlots ? (
            <p className="py-3 text-sm text-muted">Buscando horarios…</p>
          ) : slots.length === 0 ? (
            <p className="py-3 text-sm text-muted">
              No queda nada libre ese día. Prueba con otra fecha.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((iso) => {
                const active = slot === iso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSlot(iso)}
                    className={[
                      "touch-target rounded-xl border py-3 text-sm tabular-nums transition",
                      active
                        ? "border-gold bg-gold font-semibold text-background"
                        : "border-line text-foreground hover:border-muted",
                    ].join(" ")}
                  >
                    {timeFormat.format(new Date(iso))}
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      ) : null}

      {slot && branch ? (
        <Section step={step(5)} title="Tus datos" last>
          <div className="flex flex-col gap-6">
            <Field id="name" label="Nombre" autoComplete="name" maxLength={120} />
            <Field
              id="phone"
              label="Teléfono"
              type="tel"
              autoComplete="tel"
              maxLength={40}
            />
            <Field
              id="email"
              label="Correo"
              type="email"
              autoComplete="email"
              maxLength={200}
            />
          </div>

          <MembershipUpsell
            totalCents={totalCents}
            memberships={memberships}
            branchName={branch.name}
            buying={buyingMembership}
            onBuy={(id) => void buyMembership(id)}
          />

          {status.kind === "error" ? (
            <p role="alert" className="mt-6 text-sm text-danger">
              {status.message}
            </p>
          ) : null}
          {membershipNote ? (
            <p className="mt-6 text-sm text-gold">{membershipNote}</p>
          ) : null}
        </Section>
      ) : null}

      {/* Running total, pinned so it is never hidden until checkout. */}
      {service ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-4 px-6 py-4 sm:px-8">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] text-muted">
                {service.name}
                {selectedExtras.length > 0
                  ? ` + ${selectedExtras.length} extra${selectedExtras.length > 1 ? "s" : ""}`
                  : ""}
              </p>
              <p
                className="display text-xl tabular-nums"
                data-testid="running-total"
                aria-live="polite"
                aria-label={`Total ${formatMoney(totalCents)}`}
              >
                {formatMoney(totalCents)}
              </p>
            </div>

            {slot ? (
              <button
                type="submit"
                disabled={status.kind === "sending"}
                className="touch-target shrink-0 rounded-full bg-gold px-7 py-3 text-sm font-semibold text-background transition hover:bg-gold-soft disabled:opacity-40"
              >
                {status.kind === "sending" ? "Procesando…" : "Pagar"}
              </button>
            ) : (
              <span className="shrink-0 text-xs text-muted">
                Elige fecha y hora
              </span>
            )}
          </div>
        </div>
      ) : null}
    </form>
  );
}

function Section({
  step,
  title,
  hint,
  last,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "py-9" : "border-b border-line py-9 first:pt-0"}>
      <div className="mb-6 flex items-baseline gap-4">
        <span className="text-[0.625rem] tabular-nums text-gold">
          {String(step).padStart(2, "0")}
        </span>
        <h2 className="eyebrow text-foreground">{title}</h2>
        {hint ? <span className="ml-auto text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Card({
  name,
  selected,
  onClick,
  children,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-item-name={name}
      className={[
        "card-surface touch-target w-full p-5 text-left transition",
        selected ? "border-gold" : "hover:border-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Row({
  selected,
  onClick,
  title,
  subtitle,
  price,
  multi,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  price: string;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-item-name={title}
      className={[
        "touch-target flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition",
        selected
          ? "border-gold bg-surface"
          : "border-line hover:border-muted",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-4 w-4 shrink-0 items-center justify-center border transition",
          multi ? "rounded-[4px]" : "rounded-full",
          selected ? "border-gold bg-gold" : "border-line",
        ].join(" ")}
      >
        {selected ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-background" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10 3L4.5 8.5 2 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem]">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>
      </span>

      <span
        className={`shrink-0 text-sm tabular-nums ${selected ? "text-gold" : "text-muted"}`}
      >
        {price}
      </span>
    </button>
  );
}

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  maxLength,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow mb-2 block text-muted">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-foreground outline-none transition focus:border-gold"
      />
    </div>
  );
}
