import type { Db } from "@/lib/db";

/**
 * Invoicing, with the payment processor left as a seam.
 *
 * The security property worth stating explicitly: no card data ever reaches this
 * application. A provider is asked for a hosted checkout link, and all that comes
 * back is an opaque reference and a URL. The customer types their card into the
 * processor's page, on the processor's domain. This app stores `externalRef` and
 * `checkoutUrl` and nothing else — there is no card field in the schema, and adding
 * one would pull the whole system into PCI scope.
 *
 * `stubPaymentProvider` is wired in by default and talks to nobody. Swapping in a
 * real processor means implementing `PaymentProvider` and passing it in; no caller
 * changes. See README "What to plug in for production".
 */

export type CheckoutLinkRequest = {
  invoiceId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
};

export type CheckoutLink = {
  /** The processor's own id for the payment session. Opaque to us. */
  externalRef: string;
  /** Hosted payment page. The customer leaves our domain to pay. */
  checkoutUrl: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCheckoutLink(request: CheckoutLinkRequest): Promise<CheckoutLink>;
}

/**
 * Development stub. Generates a local placeholder URL, contacts no network service,
 * and requires no credentials — deliberately, so that a fresh clone runs without any
 * secret being invented or committed.
 */
export const stubPaymentProvider: PaymentProvider = {
  name: "stub",

  async createCheckoutLink(request: CheckoutLinkRequest): Promise<CheckoutLink> {
    const externalRef = `stub_${request.invoiceId}`;

    return {
      externalRef,
      checkoutUrl: `https://payments.invalid/checkout/${externalRef}`,
    };
  },
};

export type InvoiceResult =
  | { ok: true; invoice: { id: string; amountCents: number; checkoutUrl: string | null } }
  | { ok: false; reason: "appointment_not_found" };

/** Raise an invoice for a completed appointment. */
export async function createInvoiceForAppointment(
  db: Db,
  appointmentId: string,
  provider: PaymentProvider = stubPaymentProvider,
): Promise<InvoiceResult> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      customer: { select: { id: true, email: true } },
      service: { select: { name: true, priceCents: true } },
    },
  });

  if (!appointment) {
    return { ok: false, reason: "appointment_not_found" };
  }

  const invoice = await db.invoice.create({
    data: {
      customerId: appointment.customer.id,
      appointmentId: appointment.id,
      amountCents: appointment.service.priceCents,
      currency: "MXN",
      status: "draft",
      issuedAt: new Date(),
    },
    select: { id: true, amountCents: true, currency: true },
  });

  const link = await provider.createCheckoutLink({
    invoiceId: invoice.id,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    description: appointment.service.name,
    customerEmail: appointment.customer.email,
  });

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: {
      externalRef: link.externalRef,
      checkoutUrl: link.checkoutUrl,
      status: "sent",
    },
    select: { id: true, amountCents: true, checkoutUrl: true },
  });

  return { ok: true, invoice: updated };
}
