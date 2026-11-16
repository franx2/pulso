import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ClientesClient from "./ClientesClient";

export default async function Pagina() {
  const session = await requireEmpleado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <ClientesClient />
    </PageShell>
  );
}
