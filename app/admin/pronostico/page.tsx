import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import PronosticoClient from "./PronosticoClient";

export default async function PronosticoPage({
  searchParams,
}: {
  searchParams: Promise<{ localId?: string | string[] }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const initialLocalId = typeof params.localId === "string" ? params.localId : "";
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="pronostico" width="full">
      <PronosticoClient initialLocalId={initialLocalId} />
    </PageShell>
  );
}
