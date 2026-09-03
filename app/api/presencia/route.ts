import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEncargadoApi } from "@/lib/session";
import { comoFechaSql, inicioDelDia } from "@/lib/fechas";
import { fotoDelDia, sincronizarAlertas, notificarAlertasPendientes } from "@/lib/presencia";

export async function GET(request: Request) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const localId = new URL(request.url).searchParams.get("localId") || undefined;

  // Las alertas se recalculan al mirar el panel: sin cron, el encargado ve
  // siempre el estado real. El mail que se dispara acá cubre el caso de que
  // nadie esté mirando; ver .env.example para programarlo también por cron.
  // Se sincroniza siempre sobre TODO el negocio, sin filtrar por sucursal.
  await sincronizarAlertas();
  notificarAlertasPendientes().catch(() => {}); // no bloquea la respuesta

  const [foto, alertas, correcciones, ausencias, rostrosDudosos] = await Promise.all([
    fotoDelDia(new Date(), localId),
    db.alerta.findMany({
      where: { fecha: comoFechaSql(), resuelta: false, ...(localId ? { localId } : {}) },
      include: { empleado: { select: { nombre: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.solicitudCorreccion.findMany({
      where: { estado: "PENDIENTE", ...(localId ? { empleado: { localId } } : {}) },
      include: {
        empleado: { select: { nombre: true } },
        fichaje: { select: { tipo: true, timestamp: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.ausencia.findMany({
      where: { estado: "PENDIENTE", ...(localId ? { empleado: { localId } } : {}) },
      select: {
        id: true,
        tipo: true,
        desde: true,
        hasta: true,
        motivo: true,
        certificadoTipo: true,
        empleado: { select: { nombre: true } },
      },
      orderBy: { desde: "asc" },
    }),
    // Fichajes de hoy donde el control de rostro no cerró.
    db.fichaje.findMany({
      where: {
        timestamp: { gte: inicioDelDia() },
        rostro: { in: ["NO_COINCIDE", "SIN_ROSTRO", "NO_REGISTRADO"] },
        ...(localId ? { localId } : {}),
      },
      select: {
        id: true,
        tipo: true,
        timestamp: true,
        rostro: true,
        rostroDistancia: true,
        rostroFotoTipo: true,
        empleado: { select: { nombre: true } },
      },
      orderBy: { timestamp: "desc" },
    }),
  ]);

  return NextResponse.json({
    filas: foto.map((f) => f.fila),
    alertas: alertas.map((a) => ({
      id: a.id,
      tipo: a.tipo,
      detalle: a.detalle,
      empleado: a.empleado.nombre,
    })),
    correcciones: correcciones.map((c) => ({
      id: c.id,
      empleado: c.empleado.nombre,
      tipo: c.tipo,
      tipoFichaje: c.tipoFichaje,
      fechaHora: c.fechaHora?.toISOString() ?? null,
      motivo: c.motivo,
      actual: c.fichaje
        ? { tipo: c.fichaje.tipo, timestamp: c.fichaje.timestamp.toISOString() }
        : null,
    })),
    ausencias: ausencias.map((a) => ({
      id: a.id,
      empleado: a.empleado.nombre,
      tipo: a.tipo,
      desde: a.desde.toISOString(),
      hasta: a.hasta.toISOString(),
      motivo: a.motivo,
      tieneCertificado: Boolean(a.certificadoTipo),
    })),
    rostrosDudosos: rostrosDudosos.map((f) => ({
      id: f.id,
      empleado: f.empleado.nombre,
      tipo: f.tipo,
      timestamp: f.timestamp.toISOString(),
      rostro: f.rostro,
      distancia: f.rostroDistancia,
      tieneFoto: Boolean(f.rostroFotoTipo),
    })),
  });
}
