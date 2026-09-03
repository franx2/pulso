import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ReportesClient from "./ReportesClient";

export default async function ReportesPage() {
  const session = await requireAdmin();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="reportes">
      <ReportesClient />
    </PageShell>
  );
}
