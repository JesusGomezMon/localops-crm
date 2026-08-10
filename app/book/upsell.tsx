"use client";

import { bestMembershipPitch, type MembershipLike } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";

const TIER_GRADIENT: Record<string, string> = {
  Gold: "tier-grad-gold",
  Diamante: "tier-grad-diamante",
  Platinum: "tier-grad-platinum",
  Black: "tier-grad-black",
};

/**
 * The membership moment.
 *
 * Appears once a basket exists. The CTA buys the pitched tier — if the visitor
 * already filled name / email / phone, checkout starts immediately.
 */
export function MembershipUpsell({
  totalCents,
  memberships,
  branchName,
  buying,
  onBuy,
}: {
  totalCents: number;
  memberships: MembershipLike[];
  branchName: string;
  buying: boolean;
  onBuy: (membershipId: string) => void;
}) {
  const pitch = bestMembershipPitch(totalCents, memberships, branchName);

  if (!pitch) {
    return null;
  }

  const { membership, alaCarteMonthlyCents, savingsCents } = pitch;
  const gradient = TIER_GRADIENT[membership.name] ?? "tier-grad-gold";

  return (
    <div className="card-surface mt-6 overflow-hidden p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted">Membresía {membership.name}</p>
          <p className="mt-3 text-sm text-muted">
            Vienes dos veces al mes y pagas{" "}
            <span className="text-foreground tabular-nums">
              {formatMoney(alaCarteMonthlyCents)}
            </span>
            .
          </p>
        </div>

        <p
          className={`${gradient} tier-text display shrink-0 text-3xl leading-none`}
        >
          {formatMoney(membership.priceCents)}
        </p>
      </div>

      <p className="mt-5 border-t border-line pt-5 text-lg text-gold">
        Ahorras {formatMoney(savingsCents)} vs. precio estándar
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {membership.benefits.slice(0, 3).map((benefit) => (
          <li key={benefit} className="flex gap-3 text-sm text-muted">
            <span className="mt-2 h-px w-3 shrink-0 bg-line" />
            {benefit}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={buying}
        onClick={() => onBuy(membership.id)}
        className="touch-target mt-6 w-full rounded-full bg-gold px-6 py-3.5 text-sm font-semibold text-background transition hover:bg-gold-soft disabled:opacity-40"
      >
        {buying ? "Procesando…" : `Comprar ${membership.name}`}
      </button>

      <p className="mt-4 text-xs text-muted">
        Llena nombre, correo y teléfono arriba y te llevamos al pago.
      </p>
    </div>
  );
}
