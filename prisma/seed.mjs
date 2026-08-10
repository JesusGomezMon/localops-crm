// Seed script — Kasterz, the only business.
//
// This used to create two tenants so cross-tenant isolation was demonstrable. That
// boundary is gone; the second business (Costa Clean) was deleted with it.
//
// The catalogue, prices, branches, opening hours and membership tiers are transcribed
// from kasterz.com. Massage durations are published; barbering durations are NOT, so
// those are working estimates — they set slot length, so confirm before go-live.

import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

/**
 * Mirrors lib/password.ts. Duplicated rather than imported because this script is
 * plain .mjs run by `node`, with no TypeScript loader in the path — and the format
 * (`scrypt$salt$hash`) is the contract both sides agree on.
 */
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "admin123";

/** `{ dayOfWeek: [openMinutes, closeMinutes] }`; 0 = Sunday. Mirrors lib/opening-hours.ts. */
function hours(spec) {
  const out = {};
  for (const [day, [open, close]] of Object.entries(spec)) {
    out[day] = [toMin(open), toMin(close)];
  }
  return JSON.stringify(out);
}

function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Kasterz: Mon–Fri 09:00–22:00, Sat 09:00–21:00, Sun 11:00–19:00.
const KASTERZ_HOURS = hours({
  1: ["09:00", "22:00"],
  2: ["09:00", "22:00"],
  3: ["09:00", "22:00"],
  4: ["09:00", "22:00"],
  5: ["09:00", "22:00"],
  6: ["09:00", "21:00"],
  0: ["11:00", "19:00"],
});

function at(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const BRANCHES = [
  {
    name: "Huayacán",
    slug: "Huayacan",
    address:
      "Plaza Andara, Av. Huayacán entre Av. Álamos y C. Sierra Madre, Sm 311, 77533 Cancún, Q.R.",
    phone: "+52 998 762 1265",
    openingHours: KASTERZ_HOURS,
    vipOnly: false,
    amenities: JSON.stringify(["Área regular", "Área VIP", "Bar"]),
  },
  {
    name: "Puerto Cancún",
    slug: "PuertoCancun",
    address:
      "Edificio ESPACIO, Av. Bonampak, Blvd. Kukulcán, Zona Hotelera, 77500 Cancún, Q.R.",
    phone: "+52 998 766 7837",
    openingHours: KASTERZ_HOURS,
    // VIP-only: the flow hides every "basico" service and package here.
    vipOnly: true,
    amenities: JSON.stringify(["Solo VIP", "Sauna", "Cold tub", "Bar"]),
  },
];

// `tier` drives branch filtering; `kind` drives flow behaviour.
const SERVICES = [
  { name: "Corte de cabello", category: "Barbería", tier: "basico", kind: "service", durationMin: 45, priceCents: 39900 },
  { name: "Barba", category: "Barbería", tier: "basico", kind: "service", durationMin: 30, priceCents: 34900 },
  { name: "Corte de cabello VIP", category: "Barbería", tier: "vip", kind: "service", durationMin: 60, priceCents: 49900 },
  { name: "Barba VIP", category: "Barbería", tier: "vip", kind: "service", durationMin: 45, priceCents: 44900 },

  { name: "Cabello y barba", category: "Paquetes", tier: "basico", kind: "package", durationMin: 75, priceCents: 69900 },
  { name: "Cabello, barba y ceja", category: "Paquetes", tier: "basico", kind: "package", durationMin: 90, priceCents: 79900 },
  { name: "Cabello y tinte cubrecanas", category: "Paquetes", tier: "basico", kind: "package", durationMin: 90, priceCents: 84900 },
  { name: "Cabello y barba VIP", category: "Paquetes", tier: "vip", kind: "package", durationMin: 90, priceCents: 84900 },
  { name: "Cabello, barba y ceja VIP", category: "Paquetes", tier: "vip", kind: "package", durationMin: 105, priceCents: 94900 },
  {
    name: "Cabello, barba, tinte cubrecanas y pigmento",
    category: "Paquetes",
    tier: "vip",
    kind: "package",
    durationMin: 150,
    priceCents: 139900,
  },

  { name: "Ceja", category: "Extras", tier: "universal", kind: "extra", durationMin: 15, priceCents: 18000 },
  { name: "Depilación KZ", category: "Extras", tier: "universal", kind: "extra", durationMin: 15, priceCents: 18000 },
  { name: "Pigmentación", category: "Extras", tier: "universal", kind: "extra", durationMin: 30, priceCents: 25000 },
  { name: "Mask Carbono", category: "Extras", tier: "universal", kind: "extra", durationMin: 30, priceCents: 19900 },
  { name: "Mask Colágeno", category: "Extras", tier: "universal", kind: "extra", durationMin: 30, priceCents: 29900 },
  { name: "Facial premium", category: "Extras", tier: "universal", kind: "extra", durationMin: 45, priceCents: 49900 },
  { name: "Tinte cubrecanas", category: "Extras", tier: "universal", kind: "extra", durationMin: 45, priceCents: 49900 },
  { name: "Presoterapia", category: "Extras", tier: "universal", kind: "extra", durationMin: 45, priceCents: 49900 },

  { name: "Masaje relajante", category: "Spa", tier: "universal", kind: "spa", durationMin: 60, priceCents: 89900 },
  { name: "Masaje sueco", category: "Spa", tier: "universal", kind: "spa", durationMin: 60, priceCents: 89900 },
  { name: "Masaje de tejido profundo", category: "Spa", tier: "universal", kind: "spa", durationMin: 60, priceCents: 99900 },
  { name: "Masaje deportivo", category: "Spa", tier: "universal", kind: "spa", durationMin: 80, priceCents: 109900 },
  { name: "Masaje terapéutico", category: "Spa", tier: "universal", kind: "spa", durationMin: 80, priceCents: 109900 },
  { name: "Masaje descontracturante", category: "Spa", tier: "universal", kind: "spa", durationMin: 80, priceCents: 109900 },
];

const MEMBERSHIPS = [
  {
    name: "Gold",
    priceCents: 79900,
    savingsCents: 20000,
    plans: ["Signature — 2 visitas/mes"],
    benefits: [
      "2 servicios Essential al mes (cabello o barba)",
      "Solo sucursal Huayacán",
      "Cualquier barbero, sin barbero asignado — agenda libre",
    ],
  },
  {
    name: "Diamante",
    priceCents: 99900,
    savingsCents: 30000,
    plans: ["Signature — 2 visitas/mes"],
    benefits: [
      "2 servicios Essential al mes en área VIP",
      "Cualquier barbero, cualquier sucursal",
      "Sin barbero asignado — agenda libre",
    ],
  },
  {
    name: "Platinum",
    priceCents: 139900,
    savingsCents: 40000,
    highlight: true,
    plans: ["Signature — 2 visitas/mes", "Frequency — 4 visitas/mes", "Unlimited"],
    benefits: [
      "Servicio Master: cabello y barba por visita",
      "Barbero asignado en Frequency y Unlimited",
      "Área regular en Huayacán, VIP en Puerto Cancún",
    ],
  },
  {
    name: "Black",
    priceCents: 199900,
    savingsCents: 50000,
    plans: ["Signature — 2 visitas/mes", "Frequency — 4 visitas/mes", "Unlimited"],
    benefits: [
      "Servicio Presidencial: cabello, barba, ceja y ritual completo",
      "Acceso a sauna y cold tub",
      "Welcome kit y prioridad en eventos",
      "Área VIP en Puerto Cancún",
    ],
  },
];

const CUSTOMERS = [
  { name: "María Fernández", email: "maria@example.test", phone: "+52 998 111 2233" },
  { name: "Jorge Salinas", email: "jorge@example.test", phone: "+52 998 444 5566" },
];

async function main() {
  // The one staff account. Re-seeding resets the password, which is the intended
  // recovery path in development.
  await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { role: "owner", passwordHash: hashPassword(ADMIN_PASSWORD) },
    create: {
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      name: "Kasterz Admin",
      role: "owner",
    },
  });

  // Accounts carried over from the pre-password schema have no hash and therefore
  // cannot sign in. Clearing them avoids leaving dead rows that look like access.
  const removed = await prisma.user.deleteMany({
    where: { passwordHash: null, username: { not: ADMIN_USERNAME } },
  });

  const branches = [];
  for (const b of BRANCHES) {
    const existing = await prisma.branch.findFirst({ where: { name: b.name } });
    branches.push(
      existing
        ? await prisma.branch.update({ where: { id: existing.id }, data: b })
        : await prisma.branch.create({ data: b }),
    );
  }

  const services = [];
  for (const [index, s] of SERVICES.entries()) {
    const data = { ...s, sortOrder: index };
    const existing = await prisma.service.findFirst({ where: { name: s.name } });
    services.push(
      existing
        ? await prisma.service.update({ where: { id: existing.id }, data })
        : await prisma.service.create({ data }),
    );
  }

  for (const [index, m] of MEMBERSHIPS.entries()) {
    const data = {
      ...m,
      sortOrder: index,
      plans: JSON.stringify(m.plans ?? []),
      benefits: JSON.stringify(m.benefits ?? []),
    };
    const existing = await prisma.membership.findFirst({ where: { name: m.name } });
    if (existing) {
      await prisma.membership.update({ where: { id: existing.id }, data });
    } else {
      await prisma.membership.create({ data });
    }
  }

  const customers = [];
  for (const c of CUSTOMERS) {
    customers.push(
      await prisma.customer.upsert({
        where: { email: c.email },
        update: c,
        create: c,
      }),
    );
  }

  // One appointment tomorrow at 10:00 so the dashboard is not empty on first run.
  const startsAt = at(1, 10);
  const existingAppt = await prisma.appointment.findFirst({ where: { startsAt } });
  if (!existingAppt) {
    await prisma.appointment.create({
      data: {
        branchId: branches[0].id,
        customerId: customers[0].id,
        serviceId: services[0].id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + services[0].durationMin * 60 * 1000),
        status: "confirmed",
        source: "staff",
        totalCents: services[0].priceCents,
      },
    });
  }

  console.log(
    `Kasterz sembrado: ${SERVICES.length} servicios, ${MEMBERSHIPS.length} membresías, ${BRANCHES.length} sucursales`,
  );
  if (removed.count > 0) {
    console.log(`${removed.count} cuenta(s) sin contraseña eliminadas`);
  }
  console.log(`Acceso al panel: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log("Página pública: /book");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
