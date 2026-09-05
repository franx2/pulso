import type { Sector } from "@prisma/client";
import { db } from "@/lib/db";
import { COEFICIENTES_CANAL_INICIALES, COEFICIENTES_INICIALES, SECTORES } from "./carga";
import { CAPACIDAD_INICIAL } from "./motor";

/**
 * Siembra la configuración editable (matrices y capacidades) con los valores
 * de arranque, marcados DEFECTO. Es idempotente: no pisa nada que alguien ya
 * haya tocado a mano (MANUAL) ni lo que el sistema haya aprendido.
 */
export async function sembrarConfiguracion(): Promise<{ coeficientes: number; canales: number; capacidades: number }> {
  let coeficientes = 0;
  let canales = 0;
  let capacidades = 0;

  for (const [categoria, porSector] of Object.entries(COEFICIENTES_INICIALES)) {
    for (const sector of SECTORES) {
      const valor = porSector[sector];
      if (valor == null) continue;
      const existente = await db.coeficienteSector.findFirst({ where: { localId: null, categoria, sector } });
      if (existente) continue;
      await db.coeficienteSector.create({
        data: { localId: null, categoria, sector, coeficiente: valor, origen: "DEFECTO" },
      });
      coeficientes++;
    }
  }

  for (const [canal, porSector] of Object.entries(COEFICIENTES_CANAL_INICIALES)) {
    for (const sector of SECTORES) {
      const valor = porSector[sector];
      if (valor == null) continue;
      const existente = await db.coeficienteCanal.findFirst({ where: { localId: null, canal, sector } });
      if (existente) continue;
      await db.coeficienteCanal.create({
        data: { localId: null, canal, sector, coeficiente: valor, origen: "DEFECTO" },
      });
      canales++;
    }
  }

  const locales = await db.local.findMany({ select: { id: true } });
  for (const local of locales) {
    for (const sector of SECTORES) {
      const cap = CAPACIDAD_INICIAL[sector as Sector];
      const existente = await db.capacidadSector.findUnique({
        where: { localId_sector: { localId: local.id, sector } },
      });
      if (existente) continue;
      await db.capacidadSector.create({
        data: {
          localId: local.id,
          sector,
          capacidadPorEmpleado: cap.capacidadPorEmpleado,
          minPersonas: cap.minPersonas,
          maxPersonas: cap.maxPersonas,
          origen: "DEFECTO",
          // Confianza al piso: hoy no hay fichajes suficientes para calibrar.
          confianza: 0.15,
          observaciones: 0,
        },
      });
      capacidades++;
    }
  }

  return { coeficientes, canales, capacidades };
}
