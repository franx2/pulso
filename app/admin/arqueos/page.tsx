import { requireEncargado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ArqueosClient from "./ArqueosClient";

export default async function ArqueosPage() {
  const session = await requireEncargado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="arqueos">
      <ArqueosClient />
    </PageShell>
  );
}
