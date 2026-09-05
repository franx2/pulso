import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import AjustesClient from "./AjustesClient";

export default async function AjustesPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="pronostico">
      <AjustesClient />
    </PageShell>
  );
}
