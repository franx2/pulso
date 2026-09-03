import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import LocalesClient from "./LocalesClient";

export default async function ConfiguracionPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="configuracion">
      <LocalesClient />
    </PageShell>
  );
}
