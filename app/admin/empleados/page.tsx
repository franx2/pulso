import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import EmpleadosClient from "./EmpleadosClient";

export default async function EmpleadosPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="empleados">
      <EmpleadosClient />
    </PageShell>
  );
}
