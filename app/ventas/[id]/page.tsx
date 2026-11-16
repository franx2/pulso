import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import PedidoClient from "./PedidoClient";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireEmpleado();
  const { id } = await params;
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <PedidoClient id={id} />
    </PageShell>
  );
}
