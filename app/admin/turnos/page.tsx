import { requireEncargado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import TurnosClient from "./TurnosClient";

export default async function TurnosPage() {
  const session = await requireEncargado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="turnos">
      <TurnosClient />
    </PageShell>
  );
}
