/**
 * Catalogue rules: what a branch may offer, and what a selection costs.
 *
 * Pure functions over plain data — no database, no React. That is deliberate: the
 * branch-tier filter is the single most important business rule in this flow, and it
 * is enforced in two places (the UI hides items; the server refuses them). Keeping it
 * here means both call the *same* function, so they cannot drift.
 */

export type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  category: string;
  /** "basico" | "vip" | "universal" */
  tier: string;
  /** "service" | "package" | "extra" | "spa" */
  kind: string;
};

export type BranchLike = { vipOnly: boolean };

/**
 * THE branch filter.
 *
 * A VIP-only branch (Puerto Cancún) sells no Regular-tier work: neither the à la carte
 * Básico services nor the non-VIP packages. Everything marked "universal" — extras and
 * spa massages — is available at every branch, always.
 *
 * A mixed branch (Huayacán) has both areas, so it offers everything.
 */
export function isAvailableAtBranch(
  item: Pick<CatalogItem, "tier">,
  branch: BranchLike,
): boolean {
  if (!branch.vipOnly) {
    return true;
  }
  return item.tier !== "basico";
}

export type VisibleCatalog = {
  /** Single-choice items: services, packages and spa treatments. */
  primary: CatalogItem[];
  /** Multi-select add-ons, priced additively. */
  extras: CatalogItem[];
};

/** Split a tenant's catalogue into what this branch may show, primary vs. extras. */
export function visibleCatalog(
  items: CatalogItem[],
  branch: BranchLike,
): VisibleCatalog {
  const allowed = items.filter((item) => isAvailableAtBranch(item, branch));

  return {
    primary: allowed.filter((i) => i.kind !== "extra"),
    extras: allowed.filter((i) => i.kind === "extra"),
  };
}

/** Group primary items by their category, preserving the order they arrive in. */
export function groupByCategory(
  items: CatalogItem[],
): Array<[string, CatalogItem[]]> {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.category);
    if (bucket) bucket.push(item);
    else groups.set(item.category, [item]);
  }
  return [...groups.entries()];
}

/** Primary service plus every selected extra. Extras are additive, never bundled. */
export function computeTotalCents(
  primary: Pick<CatalogItem, "priceCents"> | null | undefined,
  extras: Array<Pick<CatalogItem, "priceCents">>,
): number {
  const base = primary?.priceCents ?? 0;
  return extras.reduce((sum, e) => sum + e.priceCents, base);
}

/**
 * Extras add price but not time. The published durations cover the primary service
 * only, and the business absorbs add-ons inside the same appointment — so the slot
 * length is driven by the primary item alone. Flagged in the README.
 */
export function computeDurationMin(
  primary: Pick<CatalogItem, "durationMin"> | null | undefined,
): number {
  return primary?.durationMin ?? 0;
}

// ---- Membership upsell ------------------------------------------------------

export type MembershipLike = {
  id: string;
  name: string;
  priceCents: number;
  savingsCents: number | null;
  plans: string[];
  benefits: string[];
  highlight: boolean;
};

/**
 * Every tier's entry plan (Signature) includes two visits a month — verified on
 * kasterz.com/membresias, where all four tiers list "2 visitas/mes".
 */
export const VISITS_PER_MONTH = 2;

/**
 * A tier whose benefits name one specific branch only applies at that branch.
 *
 * Gold's own benefit line reads "Solo sucursal Huayacán", so pitching it to someone
 * standing in Puerto Cancún would be selling them something they cannot use. This
 * reads the copy rather than a dedicated column: the restriction already lives in the
 * text the client maintains, and inventing a second source of truth invites the two
 * to disagree. Heuristic, and noted as such in the README.
 */
export function tierAppliesAtBranch(
  membership: Pick<MembershipLike, "benefits">,
  branchName: string,
): boolean {
  const restriction = membership.benefits.find((b) => /solo sucursal/i.test(b));
  if (!restriction) {
    return true;
  }
  return restriction.toLowerCase().includes(branchName.toLowerCase());
}

export type MembershipPitch = {
  membership: MembershipLike;
  /** What the visitor would pay à la carte for a month of the same visits. */
  alaCarteMonthlyCents: number;
  /** Positive saving vs. that. Mirrors the site's "Ahorras $X" framing. */
  savingsCents: number;
};

/**
 * Pick the best tier to pitch for the total the visitor has just built.
 *
 * The comparison is grounded in their actual selection, not a brochure price: if this
 * basket costs `total`, coming twice a month à la carte costs `total × 2`, and the
 * tier costs its monthly fee. The difference is the number we show.
 *
 * Returns null when nothing genuinely saves them money — an upsell that is a worse
 * deal is just a lie, and a customer who works that out once stops trusting the rest
 * of the page.
 */
export function bestMembershipPitch(
  totalCents: number,
  memberships: MembershipLike[],
  branchName: string,
): MembershipPitch | null {
  if (totalCents <= 0) {
    return null;
  }

  const alaCarteMonthlyCents = totalCents * VISITS_PER_MONTH;

  const candidates = memberships
    .filter((m) => tierAppliesAtBranch(m, branchName))
    .map((m) => ({
      membership: m,
      alaCarteMonthlyCents,
      savingsCents: alaCarteMonthlyCents - m.priceCents,
    }))
    .filter((c) => c.savingsCents > 0);

  if (candidates.length === 0) {
    return null;
  }

  // Best saving wins; ties break toward the cheaper tier, which is the easier yes.
  candidates.sort(
    (a, b) =>
      b.savingsCents - a.savingsCents ||
      a.membership.priceCents - b.membership.priceCents,
  );

  return candidates[0];
}
