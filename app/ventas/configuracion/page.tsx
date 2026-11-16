import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ConfiguracionVentasClient from "./ConfiguracionVentasClient";

export default async function ConfiguracionVentasPage() {
  const session = await requireEmpleado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <ConfiguracionVentasClient />
    </PageShell>
  );
}
