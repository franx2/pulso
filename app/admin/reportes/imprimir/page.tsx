import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";
import ImprimirClient from "./ImprimirClient";

/** Sin PageShell a propósito: esta pantalla es para imprimir, sin nav ni header. */
export default async function ImprimirPage() {
  await requireAdmin();
  return (
    <Suspense fallback={null}>
      <ImprimirClient />
    </Suspense>
  );
}
