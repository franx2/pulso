import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import ProductosClient from "./ProductosClient";

export default async function ProductosPage() {
  const session = await requireEmpleado();
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <ProductosClient />
    </PageShell>
  );
}
