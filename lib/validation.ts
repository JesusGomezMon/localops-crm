import { z } from "zod";

/**
 * Request schemas.
 *
 * Every schema is `.strict()`, so an unexpected key is a 422 rather than silently
 * dropped. That matters most for `tenantId`: no schema here accepts one, and strict
 * mode turns an attempt to smuggle one in through a request body into a loud
 * rejection instead of a field that merely gets ignored.
 */

export const appointmentStatuses = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
] as const;

export const customerCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(200),
    phone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const customerUpdateSchema = customerCreateSchema.partial();

export const serviceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    durationMin: z.number().int().min(5).max(600),
    priceCents: z.number().int().min(0).max(100_000_000),
    active: z.boolean().optional(),
  })
  .strict();

export const serviceUpdateSchema = serviceCreateSchema.partial();

export const appointmentCreateSchema = z
  .object({
    branchId: z.string().min(1).max(64),
    customerId: z.string().min(1).max(64),
    serviceId: z.string().min(1).max(64),
    startsAt: z.coerce.date(),
    status: z.enum(appointmentStatuses).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const appointmentUpdateSchema = z
  .object({
    branchId: z.string().min(1).max(64).optional(),
    customerId: z.string().min(1).max(64).optional(),
    serviceId: z.string().min(1).max(64).optional(),
    startsAt: z.coerce.date().optional(),
    status: z.enum(appointmentStatuses).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

/** The public booking payload. */
export const publicBookingSchema = z
  .object({
    branchId: z.string().min(1).max(64),
    serviceId: z.string().min(1).max(64),
    startsAt: z.coerce.date(),
    name: z.string().trim().min(1).max(120),
    email: z.email().max(200),
    phone: z.string().trim().min(1).max(40),
    notes: z.string().trim().max(1000).optional(),
    /**
     * Add-on service ids. Note what is absent: any price. Amounts are read from the
     * database server-side, so a tampered body can change what is booked but never
     * what it costs.
     */
    extraIds: z.array(z.string().min(1).max(64)).max(12).optional(),
    /** Tier the visitor asked about via the upsell. Records a lead, charges nothing. */
    membershipId: z.string().min(1).max(64).nullish(),
    /** "kiosk" when booked on an in-branch tablet; used for reporting only. */
    source: z.enum(["public", "kiosk"]).optional(),
    /** Origin for Stripe's return URLs, supplied by the route, not the browser. */
    origin: z.string().url().max(200),
  })
  .strict();

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

/** Buy a membership tier. Price comes from the database, never the body. */
export const publicMembershipPurchaseSchema = z
  .object({
    membershipId: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    email: z.email().max(200),
    phone: z.string().trim().min(1).max(40),
    /** Origin for Stripe's return URLs, supplied by the route, not the browser. */
    origin: z.string().url().max(200),
  })
  .strict();

export type PublicMembershipPurchaseInput = z.infer<
  typeof publicMembershipPurchaseSchema
>;

/** Calendar availability lookup. `.strict()` refuses any unexpected key. */
export const availabilityQuerySchema = z
  .object({
    branchId: z.string().min(1).max(64),
    serviceId: z.string().min(1).max(64),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Formato esperado YYYY-MM")
      .optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado YYYY-MM-DD")
      .optional(),
  })
  .strict();
