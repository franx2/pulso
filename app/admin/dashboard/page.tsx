import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="dashboard" width="full">
      <DashboardClient />
    </PageShell>
  );
}
