import { requireAdmin } from "@/lib/session";
import { PageShell } from "@/components/PageShell";
import DashboardClient from "./DashboardClient";

/**
 * El período y el local elegidos viajan en la URL para que el tablero se
 * pueda compartir por link ("mirá marzo en Chacras") y para que recargar no
 * devuelva a la vista por defecto. Se leen acá, en el servidor, y bajan como
 * valores iniciales: después el cliente los mantiene con `replaceState`, sin
 * navegar, porque los datos ya se piden por fetch.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const texto = (clave: string) => {
    const valor = params[clave];
    return typeof valor === "string" ? valor : undefined;
  };

  return (
    <PageShell nombre={session.nombre} rol={session.rol} nav="dashboard" width="full">
      <DashboardClient
        inicial={{
          vista: texto("vista"),
          periodo: texto("periodo"),
          mes: texto("mes"),
          anio: texto("anio"),
          desde: texto("desde"),
          hasta: texto("hasta"),
          local: texto("local"),
        }}
      />
    </PageShell>
  );
}
