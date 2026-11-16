import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import CajaClient from "./CajaClient";

export default async function CajaPage() {
  const session = await requireEmpleado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <CajaClient />
    </PageShell>
  );
}
