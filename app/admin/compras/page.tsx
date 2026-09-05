import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ComprasClient from "./ComprasClient";

export default async function ComprasPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="compras" width="full">
      <ComprasClient />
    </PageShell>
  );
}
