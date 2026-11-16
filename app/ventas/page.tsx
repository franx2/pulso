import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import SalonClient from "./SalonClient";

export default async function VentasPage() {
  const session = await requireEmpleado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <SalonClient />
    </PageShell>
  );
}
