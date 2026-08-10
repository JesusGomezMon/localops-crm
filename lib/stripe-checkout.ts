/**
 * Stripe Checkout, wired through the existing `PaymentProvider` seam.
 *
 * Deliberate constraints, per the brief:
 *   - No `stripe` npm package. This calls the REST API with `fetch`, which is all a
 *     Checkout Session needs, and keeps the dependency count unchanged.
 *   - No keys are written anywhere. The secret is read from
 *     `process.env.STRIPE_SECRET_KEY` at call time and never logged.
 *   - No .env file, webhook handler, or Stripe dashboard config is touched.
 *
 * Card details never reach this application. Stripe hosts the payment page; we
 * receive an opaque session id and a URL to redirect to.
 *
 * If the key is absent the provider says so plainly instead of failing at the
 * network — a missing key is a deployment mistake, not a customer's problem.
 */

export type CheckoutLineItem = {
  name: string;
  amountCents: number;
  quantity: number;
};

export type CheckoutSession = {
  id: string;
  url: string;
};

export type CheckoutRequest = {
  lineItems: CheckoutLineItem[];
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** Echoed back by Stripe so a session can be reconciled to an appointment. */
  metadata?: Record<string, string>;
};

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "STRIPE_SECRET_KEY is not set. Configure it in the deployment environment; " +
        "this application never stores payment credentials.",
    );
    this.name = "StripeNotConfiguredError";
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Stripe's API takes form-encoded bodies with bracketed paths for nested data,
 * e.g. `line_items[0][price_data][unit_amount]`. Building that by hand avoids the
 * SDK entirely.
 */
function encodeForm(payload: Record<string, string | number>): string {
  return Object.entries(payload)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export async function createStripeCheckoutSession(
  request: CheckoutRequest,
): Promise<CheckoutSession> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new StripeNotConfiguredError();
  }

  const payload: Record<string, string | number> = {
    mode: "payment",
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    customer_email: request.customerEmail,
  };

  request.lineItems.forEach((item, i) => {
    payload[`line_items[${i}][quantity]`] = item.quantity;
    payload[`line_items[${i}][price_data][currency]`] = request.currency.toLowerCase();
    payload[`line_items[${i}][price_data][unit_amount]`] = item.amountCents;
    payload[`line_items[${i}][price_data][product_data][name]`] = item.name;
  });

  for (const [key, value] of Object.entries(request.metadata ?? {})) {
    payload[`metadata[${key}]`] = value;
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(payload),
  });

  if (!response.ok) {
    // Stripe's error body can echo request details, so it is logged server-side and
    // never returned to the browser.
    const detail = await response.text();
    console.error("[stripe] checkout session failed", response.status, detail);
    throw new Error("No pudimos iniciar el pago.");
  }

  const session = (await response.json()) as { id?: string; url?: string };

  if (!session.id || !session.url) {
    throw new Error("Stripe devolvió una sesión incompleta.");
  }

  return { id: session.id, url: session.url };
}
