import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import LocalDetalleClient from "./LocalDetalleClient";

export default async function LocalDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="configuracion">
      <LocalDetalleClient localId={id} />
    </PageShell>
  );
}
