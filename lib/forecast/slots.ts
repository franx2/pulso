/** Franjas de 30 minutos en hora argentina (UTC-3). Slot 0 = 00:00-00:30,
 * slot 47 = 23:30-24:00. Todo el módulo razona en estos slots y consolida
 * hacia arriba (hora, turno, día) cuando hace falta. */

import { OFFSET_AR_MS } from "@/lib/fechaAR";

export const SLOTS_POR_DIA = 48;

/** Instante UTC → { dia: "YYYY-MM-DD", slot: 0..47 } en hora argentina. */
export function slotDesdeISO(iso: string): { dia: string; slot: number } {
  const ar = new Date(new Date(iso).getTime() - OFFSET_AR_MS);
  const dia = ar.toISOString().slice(0, 10);
  const slot = ar.getUTCHours() * 2 + (ar.getUTCMinutes() >= 30 ? 1 : 0);
  return { dia, slot };
}

export function etiquetaSlot(slot: number): string {
  const h = Math.floor(slot / 2);
  const m = slot % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

/** Turno operativo, para consolidar sin perder el sentido del negocio. */
export function turnoDeSlot(slot: number): "MADRUGADA" | "MANANA" | "TARDE" | "NOCHE" {
  const hora = Math.floor(slot / 2);
  if (hora < 7) return "MADRUGADA";
  if (hora < 13) return "MANANA";
  if (hora < 19) return "TARDE";
  return "NOCHE";
}
