import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import SectoresClient from "./SectoresClient";

export default async function SectoresPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="sectores" width="full">
      <SectoresClient />
    </PageShell>
  );
}
