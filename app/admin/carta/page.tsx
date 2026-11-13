import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import CartaClient from "./CartaClient";

export default async function CartaPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="carta" width="full">
      <CartaClient />
    </PageShell>
  );
}
