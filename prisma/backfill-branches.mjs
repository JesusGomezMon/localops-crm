// One-time data migration, run between the two branch migrations.
//
// Creates a default branch for every tenant that has none, then points every
// branch-less appointment at its tenant's first branch. After this, no appointment
// has a null branchId, so the follow-up migration can make the column required
// without losing a single row.
//
// Safe to re-run: it only fills gaps.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, branches: { select: { id: true } } },
  });

  for (const tenant of tenants) {
    let branchId = tenant.branches[0]?.id;

    if (!branchId) {
      const created = await prisma.branch.create({
        data: {
          tenantId: tenant.id,
          name: "Sucursal Principal",
          address: "Cancún, Quintana Roo",
        },
        select: { id: true },
      });
      branchId = created.id;
      console.log(`Sucursal creada para ${tenant.name}`);
    }

    const { count } = await prisma.appointment.updateMany({
      where: { tenantId: tenant.id, branchId: null },
      data: { branchId },
    });

    if (count > 0) {
      console.log(`  ${count} cita(s) asignada(s) a la sucursal principal`);
    }
  }

  const orphans = await prisma.appointment.count({ where: { branchId: null } });
  console.log(`Citas sin sucursal restantes: ${orphans}`);

  if (orphans > 0) {
    throw new Error("Quedan citas sin sucursal; no es seguro exigir la columna.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
