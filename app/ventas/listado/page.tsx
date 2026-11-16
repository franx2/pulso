import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ListadoVentasClient from "./ListadoVentasClient";

export default async function Pagina() {
  const session = await requireEmpleado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <ListadoVentasClient />
    </PageShell>
  );
}
