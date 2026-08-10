/**
 * @vitest-environment jsdom
 *
 * The rendered flow: that the branch filter reaches the screen, that extras move the
 * visible total in real time, and that a kiosk deep link starts a step further along.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookingForm } from "@/app/book/booking-form";
import type { CatalogItem, MembershipLike } from "@/lib/catalog";
import type { PublicBranch } from "@/lib/booking";

// Availability is fetched once a service is picked; stub it so these cases exercise
// only the catalogue and pricing behaviour.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify({ days: {} }), { status: 200 })),
);

const branches: PublicBranch[] = [
  {
    id: "br_huaya",
    name: "Huayacán",
    slug: "Huayacan",
    address: "Plaza Andara, Av. Huayacán",
    phone: "+52 998 762 1265",
    vipOnly: false,
    amenities: ["Área regular", "Área VIP"],
    hours: ["Lun–Vie 09:00–22:00"],
  },
  {
    id: "br_puerto",
    name: "Puerto Cancún",
    slug: "PuertoCancun",
    address: "Edificio ESPACIO, Av. Bonampak",
    phone: "+52 998 766 7837",
    vipOnly: true,
    amenities: ["Solo VIP", "Sauna", "Cold tub"],
    hours: ["Lun–Vie 09:00–22:00"],
  },
];

function item(
  id: string,
  name: string,
  tier: string,
  kind: string,
  priceCents: number,
): CatalogItem {
  return {
    id,
    name,
    description: null,
    durationMin: 45,
    priceCents,
    category: kind === "extra" ? "Extras" : "Barbería",
    tier,
    kind,
  };
}

const services: CatalogItem[] = [
  item("s1", "Corte de cabello", "basico", "service", 39900),
  item("s2", "Corte de cabello VIP", "vip", "service", 49900),
  item("p1", "Cabello y barba", "basico", "package", 69900),
  item("p2", "Cabello y barba VIP", "vip", "package", 84900),
  item("e1", "Ceja", "universal", "extra", 18000),
  item("e2", "Facial premium", "universal", "extra", 49900),
];

const memberships: MembershipLike[] = [
  {
    id: "gold",
    name: "Gold",
    priceCents: 79900,
    savingsCents: 20000,
    plans: ["Signature — 2 visitas/mes"],
    benefits: ["2 servicios Essential al mes"],
    highlight: false,
  },
];

function renderFlow(initialBranchId: string | null = null) {
  return render(
    <BookingForm
      branches={branches}
      services={services}
      memberships={memberships}
      initialBranchId={initialBranchId}
    />,
  );
}

/**
 * Selecting by `data-item-name` rather than rendered text: the visible label runs the
 * name, duration and price together, so matching on "Corte de cabello" would also hit
 * its VIP sibling and quietly assert against the wrong row.
 */
function byName(name: string): HTMLElement | undefined {
  return screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("data-item-name") === name);
}

function clickByName(name: string) {
  const match = byName(name);
  if (!match) {
    throw new Error(`No hay opción llamada "${name}"`);
  }
  fireEvent.click(match);
}

function isOffered(name: string): boolean {
  return byName(name) !== undefined;
}

/** The pinned running total — the number the customer actually watches. */
function total(): string | undefined {
  return screen.getByTestId("running-total").textContent ?? undefined;
}

describe("branch filtering on screen", () => {
  it("offers Básico and VIP work at Huayacán", () => {
    renderFlow();
    clickByName("Huayacán");

    expect(isOffered("Corte de cabello")).toBe(true);
    expect(isOffered("Corte de cabello VIP")).toBe(true);
    expect(isOffered("Cabello y barba")).toBe(true);
    expect(isOffered("Cabello y barba VIP")).toBe(true);
  });

  it("hides Básico services and non-VIP packages at Puerto Cancún", () => {
    renderFlow();
    clickByName("Puerto Cancún");

    // The $399 cut and the $699 package are Regular-tier work this branch does not do.
    expect(isOffered("Corte de cabello")).toBe(false);
    expect(isOffered("Cabello y barba")).toBe(false);

    expect(isOffered("Corte de cabello VIP")).toBe(true);
    expect(isOffered("Cabello y barba VIP")).toBe(true);
  });

  it("clears a chosen service when switching to a branch that lacks it", () => {
    renderFlow();

    clickByName("Huayacán");
    clickByName("Corte de cabello");
    expect(total()).toBe("$399.00");

    clickByName("Puerto Cancún");

    // The selection — and the total bar showing it — go with the branch.
    expect(screen.queryByTestId("running-total")).not.toBeInTheDocument();
  });
});

describe("running total", () => {
  it("shows the service price, then adds each extra in real time", () => {
    renderFlow("br_huaya");

    clickByName("Corte de cabello VIP");
    expect(total()).toBe("$499.00");

    clickByName("Ceja");
    expect(total()).toBe("$679.00");

    clickByName("Facial premium");
    expect(total()).toBe("$1,178.00");
  });

  it("subtracts an extra again when it is unticked", () => {
    renderFlow("br_huaya");

    clickByName("Corte de cabello VIP");
    clickByName("Facial premium");
    expect(total()).toBe("$998.00");

    clickByName("Facial premium");
    expect(total()).toBe("$499.00");
  });

  it("keeps extras available at the VIP-only branch", () => {
    renderFlow("br_puerto");
    clickByName("Corte de cabello VIP");

    expect(isOffered("Ceja")).toBe(true);
    expect(isOffered("Facial premium")).toBe(true);
  });
});

describe("kiosk deep link", () => {
  it("starts at the service step when a branch is pre-selected", () => {
    renderFlow("br_puerto");

    expect(screen.getByText("Servicio")).toBeInTheDocument();
    // Genuinely pinned to the VIP branch: no Básico cut on offer, no branch to choose.
    expect(isOffered("Corte de cabello")).toBe(false);
    expect(isOffered("Corte de cabello VIP")).toBe(true);
  });
});
