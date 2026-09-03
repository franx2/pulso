import { db } from "./db";
import type { Prisma } from "@prisma/client";

export type AccionAuditada = "CREAR" | "MODIFICAR" | "ELIMINAR" | "APROBAR" | "RECHAZAR";

/**
 * Deja constancia de un cambio sensible.
 *
 * Nunca debe hacer fallar la operación que la origina: si el registro no se
 * puede escribir, se loguea y se sigue. Perder una línea de bitácora es malo,
 * perder el fichaje del empleado es peor.
 */
export async function auditar({
  entidad,
  entidadId,
  accion,
  autorId,
  antes,
  despues,
  motivo,
}: {
  entidad: string;
  entidadId: string;
  accion: AccionAuditada;
  autorId: string;
  antes?: Prisma.InputJsonValue;
  despues?: Prisma.InputJsonValue;
  motivo?: string;
}) {
  try {
    await db.auditoria.create({
      data: { entidad, entidadId, accion, autorId, antes, despues, motivo },
    });
  } catch (e) {
    console.error("No se pudo registrar la auditoría:", e);
  }
}
