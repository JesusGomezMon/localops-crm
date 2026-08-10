import { db, requireStaff } from "@/lib/db";
import { formatMoney } from "@/lib/format";

export default async function ServicesPage() {
  await requireStaff();

  const services = await db.service.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      durationMin: true,
      priceCents: true,
      active: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-gold">Catálogo</p>
        <h1 className="display mt-3 text-3xl">Servicios</h1>
        <p className="mt-3 text-sm text-muted">
          Sólo los servicios activos aparecen en la página pública de reservas.
        </p>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Servicio</th>
              <th className="px-4 py-3 font-medium">Duración</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-foreground">
                  {s.name}
                  {s.description ? (
                    <span className="mt-1 block text-xs text-muted">
                      {s.description}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted">{s.durationMin} min</td>
                <td className="px-4 py-3 tabular-nums text-foreground">
                  {formatMoney(s.priceCents)}
                </td>
                <td className="px-4 py-3">
                  {s.active ? (
                    <span className="text-gold">activo</span>
                  ) : (
                    <span className="text-muted">retirado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
