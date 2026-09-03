import { NextResponse } from "next/server";
import { sincronizarAlertas, notificarAlertasPendientes } from "@/lib/presencia";

/**
 * Recalcula y notifica alertas sin que nadie tenga que abrir el panel.
 *
 * Pensado para un cron externo. Se protege con CRON_SECRET porque es la única
 * ruta que no exige sesión:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/alertas
 * Si CRON_SECRET no está configurada la ruta queda deshabilitada, para no
 * dejar un endpoint abierto por olvido.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sincronizadas = await sincronizarAlertas();
  const notificadas = await notificarAlertasPendientes();

  return NextResponse.json({ ...sincronizadas, ...notificadas });
}
