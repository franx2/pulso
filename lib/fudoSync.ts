import { db } from "@/lib/db";
import { obtenerTokenFudo, obtenerVentasCerradas } from "@/lib/fudo";
import { agregarPorDiaHora } from "@/lib/demanda";

const VENTANA_DIAS = 90;

/** Sincroniza el mapa de calor de un local desde su cuenta de Fudo, con los
 * últimos 90 días de ventas cerradas. Tira si el local no tiene credenciales. */
export async function sincronizarDemandaLocal(localId: string) {
  const local = await db.local.findUniqueOrThrow({ where: { id: localId } });
  if (!local.fudoApiKey || !local.fudoApiSecret) {
    throw new Error(`${local.nombre} no tiene credenciales de Fudo cargadas`);
  }

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - VENTANA_DIAS * 86_400_000);

  const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
  const ventas = await obtenerVentasCerradas(token, desde, hasta);
  const franjas = agregarPorDiaHora(ventas, desde, hasta);

  await db.$transaction([
    db.demandaHoraria.deleteMany({ where: { localId } }),
    db.demandaHoraria.createMany({
      data: franjas.map((f) => ({ ...f, localId })),
    }),
    db.local.update({ where: { id: localId }, data: { demandaSincronizadaEn: new Date() } }),
  ]);

  return { ventasProcesadas: ventas.length, franjas: franjas.length };
}

/** Corre la sincronización sobre todos los locales que tengan Fudo configurado. */
export async function sincronizarDemandaTodos() {
  const locales = await db.local.findMany({
    where: { fudoApiKey: { not: null }, fudoApiSecret: { not: null } },
  });
  const resultados = [];
  for (const local of locales) {
    try {
      const r = await sincronizarDemandaLocal(local.id);
      resultados.push({ localId: local.id, nombre: local.nombre, ok: true, ...r });
    } catch (e) {
      resultados.push({
        localId: local.id,
        nombre: local.nombre,
        ok: false,
        error: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }
  return resultados;
}
