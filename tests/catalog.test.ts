/**
 * The branch-tier filter, the running total, and the membership pitch.
 *
 * These are pure functions on purpose: the filter is the single most important rule in
 * the booking flow, and it is applied twice — once to hide items in the UI, once to
 * refuse them on the server. Both call the code tested here, so they cannot drift
 * apart and quietly start disagreeing about what Puerto Cancún may sell.
 */

import { describe, expect, it } from "vitest";

import {
  bestMembershipPitch,
  computeTotalCents,
  isAvailableAtBranch,
  tierAppliesAtBranch,
  visibleCatalog,
  type CatalogItem,
  type MembershipLike,
} from "@/lib/catalog";

const HUAYACAN = { vipOnly: false };
const PUERTO_CANCUN = { vipOnly: true };

function item(
  name: string,
  tier: string,
  kind: string,
  priceCents: number,
): CatalogItem {
  return {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    description: null,
    durationMin: 45,
    priceCents,
    category: kind === "extra" ? "Extras" : kind === "spa" ? "Spa" : "Barbería",
    tier,
    kind,
  };
}

// The real Kasterz catalogue, prices verbatim from kasterz.com.
const CATALOGUE: CatalogItem[] = [
  item("Corte de cabello", "basico", "service", 39900),
  item("Barba", "basico", "service", 34900),
  item("Corte de cabello VIP", "vip", "service", 49900),
  item("Barba VIP", "vip", "service", 44900),
  item("Cabello y barba", "basico", "package", 69900),
  item("Cabello, barba y ceja", "basico", "package", 79900),
  item("Cabello y tinte cubrecanas", "basico", "package", 84900),
  item("Cabello y barba VIP", "vip", "package", 84900),
  item("Cabello, barba y ceja VIP", "vip", "package", 94900),
  item("Cabello, barba, tinte cubrecanas y pigmento", "vip", "package", 139900),
  item("Ceja", "universal", "extra", 18000),
  item("Depilación KZ", "universal", "extra", 18000),
  item("Facial premium", "universal", "extra", 49900),
  item("Masaje relajante", "universal", "spa", 89900),
  item("Masaje deportivo", "universal", "spa", 109900),
];

describe("branch filtering", () => {
  it("shows the whole catalogue at Huayacán", () => {
    const { primary, extras } = visibleCatalog(CATALOGUE, HUAYACAN);
    const names = [...primary, ...extras].map((i) => i.name);

    expect(names).toContain("Corte de cabello");
    expect(names).toContain("Corte de cabello VIP");
    expect(names).toContain("Cabello y barba");
    expect(names).toContain("Cabello y barba VIP");
    expect(names).toHaveLength(CATALOGUE.length);
  });

  it("hides every Básico service at Puerto Cancún", () => {
    const { primary } = visibleCatalog(CATALOGUE, PUERTO_CANCUN);
    const names = primary.map((i) => i.name);

    expect(names).not.toContain("Corte de cabello");
    expect(names).not.toContain("Barba");
    expect(names).toContain("Corte de cabello VIP");
    expect(names).toContain("Barba VIP");
  });

  it("hides the three non-VIP packages at Puerto Cancún but keeps the VIP ones", () => {
    const { primary } = visibleCatalog(CATALOGUE, PUERTO_CANCUN);
    const names = primary.map((i) => i.name);

    // $699, $799 and $849 non-VIP — Regular-tier work the branch does not do.
    expect(names).not.toContain("Cabello y barba");
    expect(names).not.toContain("Cabello, barba y ceja");
    expect(names).not.toContain("Cabello y tinte cubrecanas");

    expect(names).toContain("Cabello y barba VIP");
    expect(names).toContain("Cabello, barba y ceja VIP");
    expect(names).toContain("Cabello, barba, tinte cubrecanas y pigmento");
  });

  it("keeps extras and spa massages visible at both branches", () => {
    const vip = visibleCatalog(CATALOGUE, PUERTO_CANCUN);
    const regular = visibleCatalog(CATALOGUE, HUAYACAN);

    for (const view of [vip, regular]) {
      expect(view.extras.map((e) => e.name)).toEqual([
        "Ceja",
        "Depilación KZ",
        "Facial premium",
      ]);
      expect(view.primary.map((p) => p.name)).toContain("Masaje relajante");
      expect(view.primary.map((p) => p.name)).toContain("Masaje deportivo");
    }
  });

  it("separates multi-select extras from single-choice primary items", () => {
    const { primary, extras } = visibleCatalog(CATALOGUE, HUAYACAN);

    expect(extras.every((e) => e.kind === "extra")).toBe(true);
    expect(primary.every((p) => p.kind !== "extra")).toBe(true);
  });

  it("is the same predicate the server uses to refuse a booking", () => {
    const basico = item("Corte de cabello", "basico", "service", 39900);

    expect(isAvailableAtBranch(basico, HUAYACAN)).toBe(true);
    expect(isAvailableAtBranch(basico, PUERTO_CANCUN)).toBe(false);
  });
});

describe("running total", () => {
  const cutVip = item("Corte de cabello VIP", "vip", "service", 49900);
  const ceja = item("Ceja", "universal", "extra", 18000);
  const facial = item("Facial premium", "universal", "extra", 49900);

  it("is the service alone when nothing is added", () => {
    expect(computeTotalCents(cutVip, [])).toBe(49900);
  });

  it("adds each extra on top, visibly and additively", () => {
    expect(computeTotalCents(cutVip, [ceja])).toBe(49900 + 18000);
    expect(computeTotalCents(cutVip, [ceja, facial])).toBe(49900 + 18000 + 49900);
  });

  it("drops back down when an extra is removed", () => {
    const withBoth = computeTotalCents(cutVip, [ceja, facial]);
    const withOne = computeTotalCents(cutVip, [ceja]);

    expect(withBoth - withOne).toBe(facial.priceCents);
  });

  it("is zero before a service is chosen, even with extras ticked", () => {
    expect(computeTotalCents(null, [])).toBe(0);
    expect(computeTotalCents(null, [ceja])).toBe(18000);
  });
});

describe("membership upsell", () => {
  const memberships: MembershipLike[] = [
    {
      id: "gold",
      name: "Gold",
      priceCents: 79900,
      savingsCents: 20000,
      plans: ["Signature — 2 visitas/mes"],
      benefits: ["2 servicios Essential al mes", "Solo sucursal Huayacán"],
      highlight: false,
    },
    {
      id: "diamante",
      name: "Diamante",
      priceCents: 99900,
      savingsCents: 30000,
      plans: ["Signature — 2 visitas/mes"],
      benefits: ["2 servicios Essential en área VIP", "Cualquier sucursal"],
      highlight: false,
    },
    {
      id: "platinum",
      name: "Platinum",
      priceCents: 139900,
      savingsCents: 40000,
      plans: ["Signature — 2 visitas/mes"],
      benefits: ["Servicio Master: cabello y barba"],
      highlight: true,
    },
  ];

  it("reacts to the actual total, not a fixed price", () => {
    // A $349 beard: two a month is $698, under Gold's $799 — nothing to pitch.
    expect(bestMembershipPitch(34900, memberships, "Huayacán")).toBeNull();

    // A $499 VIP cut: two a month is $998, so Gold now saves money.
    const modest = bestMembershipPitch(49900, memberships, "Huayacán");
    expect(modest).not.toBeNull();
    expect(modest!.alaCarteMonthlyCents).toBe(99800);

    // Add a $499 facial and the monthly spend doubles — the saving grows with it.
    const richer = bestMembershipPitch(99800, memberships, "Huayacán")!;
    expect(richer.alaCarteMonthlyCents).toBe(199600);
    expect(richer.savingsCents).toBeGreaterThan(modest!.savingsCents);
  });

  it("quotes the saving against what the visitor just built", () => {
    const pitch = bestMembershipPitch(99800, memberships, "Huayacán")!;

    // Two visits at $998 = $1,996 against Gold at $799 → saves $1,197.
    expect(pitch.membership.name).toBe("Gold");
    expect(pitch.savingsCents).toBe(199600 - 79900);
  });

  it("never pitches a tier that would cost more than paying à la carte", () => {
    // $150 twice a month is $300 — below every tier, so no tier is a saving.
    expect(bestMembershipPitch(15000, memberships, "Huayacán")).toBeNull();
  });

  it("does not offer a Huayacán-only tier to someone at Puerto Cancún", () => {
    const gold = memberships[0];

    expect(tierAppliesAtBranch(gold, "Huayacán")).toBe(true);
    expect(tierAppliesAtBranch(gold, "Puerto Cancún")).toBe(false);

    const pitch = bestMembershipPitch(99800, memberships, "Puerto Cancún");
    expect(pitch!.membership.name).not.toBe("Gold");
  });

  it("offers nothing at all before a service is selected", () => {
    expect(bestMembershipPitch(0, memberships, "Huayacán")).toBeNull();
  });
});
