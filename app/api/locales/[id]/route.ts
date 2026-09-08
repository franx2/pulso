import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fechaSql, hoyAR } from "@/lib/fechaAR";
import { requireAdminApi, requireEncargadoApi } from "@/lib/session";
import { readJsonBody } from "@/lib/http";

/** Nunca se devuelve el apiKey/apiSecret al cliente: sólo si están cargados. */
async function tieneCredencialesFudo(localId: string): Promise<boolean> {
  const local = await db.local.findUnique({
    where: { id: localId },
    select: { fudoApiKey: true, fudoApiSecret: true },
  });
  return Boolean(local?.fudoApiKey && local?.fudoApiSecret);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireEncargadoApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const local = await db.local.findUnique({
    where: { id },
    omit: { fudoApiKey: true, fudoApiSecret: true },
  });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

  // Qué está cargado y qué no. La pantalla de ajustes creció a siete solapas
  // y desde afuera todas se ven iguales: sin esto, "por qué este local no
  // tiene compras" se contesta abriendo las siete y mirando adentro.
  const mes = hoyAR().slice(0, 7);
  const [horarios, categorias, costosDelMes] = await Promise.all([
    db.horarioLocal.count({ where: { localId: id } }),
    db.categoria.count({ where: { localId: id } }),
    db.costoFijo.count({ where: { localId: id, mes, monto: { gt: 0 } } }),
  ]);

  return NextResponse.json({
    local: { ...local, fudoConfigurado: await tieneCredencialesFudo(id) },
    estado: {
      ubicacion: local.lat != null && local.lng != null,
      fudo: await tieneCredencialesFudo(id),
      horario: horarios > 0,
      categorias: categorias > 0,
      // Sin CUIT ni razón social, los remitos de este local caen en "sin
      // asignar": es la causa concreta de que tres sucursales no tengan compras.
      compras: Boolean(local.cuitCompras || local.razonSocialCompras),
      costos: costosDelMes > 0,
      mes,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody<{
    nombre?: string;
    lat?: number | null;
    lng?: number | null;
    radioMetros?: number;
    descuentaDescanso?: boolean;
    toleranciaMin?: number;
    topeSemanalHoras?: number;
    verificarRostro?: boolean;
    rostroTolerancia?: number;
    multiplicadorFeriado?: number;
    fudoApiKey?: string;
    fudoApiSecret?: string;
    comisionCredito?: number;
    comisionDebito?: number;
    comisionBilletera?: number;
    comisionDelivery?: number;
    cuitCompras?: string | null;
    razonSocialCompras?: string | null;
    saldoInicialProveedor?: number;
    saldoInicialProveedorFecha?: string | null;
  }>(request);
  if (!body) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (body.nombre !== undefined && !body.nombre.trim()) {
    return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
  }
  if (body.saldoInicialProveedor !== undefined && !Number.isFinite(body.saldoInicialProveedor)) {
    return NextResponse.json({ error: "El saldo inicial tiene que ser un número" }, { status: 400 });
  }
  if (
    body.saldoInicialProveedorFecha != null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.saldoInicialProveedorFecha)
  ) {
    return NextResponse.json({ error: "Fecha de corte inválida, se espera AAAA-MM-DD" }, { status: 400 });
  }
  // Una comisión fuera de 0-100% es un error de tipeo (poner 27 en vez de
  // 0,27), y guardarla multiplicaría el costo de venta por cien.
  for (const [campo, valor] of Object.entries({
    comisionCredito: body.comisionCredito,
    comisionDebito: body.comisionDebito,
    comisionBilletera: body.comisionBilletera,
    comisionDelivery: body.comisionDelivery,
  })) {
    if (valor !== undefined && (!Number.isFinite(valor) || valor < 0 || valor > 1)) {
      return NextResponse.json({ error: `${campo} tiene que estar entre 0 y 1 (0,27 = 27%)` }, { status: 400 });
    }
  }

  if (body.radioMetros !== undefined && body.radioMetros < 10) {
    return NextResponse.json({ error: "El radio debe ser de al menos 10 metros" }, { status: 400 });
  }
  if (body.toleranciaMin !== undefined && (body.toleranciaMin < 0 || body.toleranciaMin > 120)) {
    return NextResponse.json({ error: "La tolerancia debe estar entre 0 y 120 minutos" }, { status: 400 });
  }
  if (body.topeSemanalHoras !== undefined && body.topeSemanalHoras <= 0) {
    return NextResponse.json({ error: "El tope semanal debe ser mayor a cero" }, { status: 400 });
  }
  if (
    body.rostroTolerancia !== undefined &&
    (body.rostroTolerancia < 0.3 || body.rostroTolerancia > 0.8)
  ) {
    return NextResponse.json(
      { error: "La tolerancia del rostro debe estar entre 0.30 y 0.80" },
      { status: 400 }
    );
  }
  if (body.multiplicadorFeriado !== undefined && body.multiplicadorFeriado < 1) {
    return NextResponse.json({ error: "El multiplicador debe ser al menos 1" }, { status: 400 });
  }

  await db.local.update({
    where: { id },
    data: {
      ...(body.nombre !== undefined ? { nombre: body.nombre.trim() } : {}),
      ...(body.lat !== undefined ? { lat: body.lat } : {}),
      ...(body.lng !== undefined ? { lng: body.lng } : {}),
      ...(body.radioMetros !== undefined ? { radioMetros: body.radioMetros } : {}),
      ...(body.descuentaDescanso !== undefined ? { descuentaDescanso: body.descuentaDescanso } : {}),
      ...(body.toleranciaMin !== undefined ? { toleranciaMin: body.toleranciaMin } : {}),
      ...(body.topeSemanalHoras !== undefined ? { topeSemanalHoras: body.topeSemanalHoras } : {}),
      ...(body.verificarRostro !== undefined ? { verificarRostro: body.verificarRostro } : {}),
      ...(body.rostroTolerancia !== undefined ? { rostroTolerancia: body.rostroTolerancia } : {}),
      ...(body.multiplicadorFeriado !== undefined
        ? { multiplicadorFeriado: body.multiplicadorFeriado }
        : {}),
      ...(body.fudoApiKey !== undefined ? { fudoApiKey: body.fudoApiKey.trim() || null } : {}),
      ...(body.fudoApiSecret !== undefined ? { fudoApiSecret: body.fudoApiSecret.trim() || null } : {}),
      ...(body.comisionCredito !== undefined ? { comisionCredito: body.comisionCredito } : {}),
      ...(body.comisionDebito !== undefined ? { comisionDebito: body.comisionDebito } : {}),
      ...(body.comisionBilletera !== undefined ? { comisionBilletera: body.comisionBilletera } : {}),
      ...(body.comisionDelivery !== undefined ? { comisionDelivery: body.comisionDelivery } : {}),
      // El CUIT se guarda sin puntos ni guiones: es la clave contra la que se
      // compara el remito, y el proveedor lo escribe de las dos formas.
      ...(body.cuitCompras !== undefined
        ? { cuitCompras: body.cuitCompras?.replace(/\D/g, "") || null }
        : {}),
      ...(body.razonSocialCompras !== undefined
        ? { razonSocialCompras: body.razonSocialCompras?.trim() || null }
        : {}),
      ...(body.saldoInicialProveedor !== undefined
        ? { saldoInicialProveedor: body.saldoInicialProveedor }
        : {}),
      ...(body.saldoInicialProveedorFecha !== undefined
        ? {
            saldoInicialProveedorFecha: body.saldoInicialProveedorFecha
              ? fechaSql(body.saldoInicialProveedorFecha)
              : null,
          }
        : {}),
    },
  });

  const local = await db.local.findUniqueOrThrow({
    where: { id },
    omit: { fudoApiKey: true, fudoApiSecret: true },
  });

  return NextResponse.json({
    local: { ...local, fudoConfigurado: await tieneCredencialesFudo(id) },
  });
}
