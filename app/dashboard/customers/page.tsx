import { db, requireStaff } from "@/lib/db";

export default async function CustomersPage() {
  await requireStaff();

  const customers = await db.customer.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      _count: { select: { appointments: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-gold">Directorio</p>
        <h1 className="display mt-3 text-3xl">Clientes</h1>
        <p className="mt-3 text-sm text-muted">
          {customers.length} cliente(s) registrado(s).
        </p>
      </div>

      {customers.length === 0 ? (
        <p className="card-surface p-10 text-center text-muted">
          Todavía no hay clientes.
        </p>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Citas</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{c.email}</td>
                  <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">
                    {c._count.appointments}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
