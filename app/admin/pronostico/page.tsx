import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import PronosticoClient from "./PronosticoClient";

export default async function PronosticoPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="pronostico">
      <PronosticoClient />
    </PageShell>
  );
}
