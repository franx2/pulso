import { requireEmpleado } from "@/lib/session";
import { db } from "@/lib/db";
import { comoFechaSql } from "@/lib/fechas";
import { PageShell } from "@/components/PageShell";
import FicharBoton from "./FicharBoton";

export default async function FicharPage() {
  const session = await requireEmpleado();

  const turnos = await db.turno.findMany({
    // `fecha` es @db.Date: se compara con medianoche UTC del día de hoy.
    where: { empleadoId: session.empleadoId!, fecha: { gte: comoFechaSql() } },
    orderBy: { fecha: "asc" },
    take: 5,
  });

  const turnosSerializados = turnos.map((t) => ({
    id: t.id,
    fecha: t.fecha.toISOString(),
    horaInicio: t.horaInicio,
    horaFin: t.horaFin,
  }));

  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="fichar">
      <FicharBoton nombreEmpleado={session.nombre ?? ""} turnos={turnosSerializados} />
    </PageShell>
  );
}
