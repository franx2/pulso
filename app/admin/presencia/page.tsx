import { requireEncargado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import PresenciaClient from "./PresenciaClient";

export default async function PresenciaPage() {
  const session = await requireEncargado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="presencia">
      <PresenciaClient />
    </PageShell>
  );
}
