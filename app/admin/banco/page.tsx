import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import BancoClient from "./BancoClient";

export default async function BancoPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="banco" width="full">
      <BancoClient />
    </PageShell>
  );
}
