import { requireEmpleado } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import PedidoClient from "./PedidoClient";

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ express?: string; cobrar?: string }>;
}) {
  const session = await requireEmpleado();
  const { id } = await params;
  const { express, cobrar } = await searchParams;
  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="ventas" width="full">
      <PedidoClient id={id} express={express === "1"} cobrarAlAbrir={cobrar === "1"} />
    </PageShell>
  );
}
