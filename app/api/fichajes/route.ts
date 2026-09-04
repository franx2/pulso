import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEmpleadoApi } from "@/lib/session";
import { distanciaMetros } from "@/lib/geo";
import { readJsonBody } from "@/lib/http";
import { calcularHoras, proximoFichaje } from "@/lib/horas";
import { comoFechaSql, inicioDelDia } from "@/lib/fechas";
import { bytesADescriptor, descriptorDesdeJson, distanciaRostros } from "@/lib/rostro";
import { leerDataUrl, type ImagenSubida } from "@/lib/dataUrl";
import type { VerificacionRostro } from "@prisma/client";
import { obtenerEfectivoCobrado, obtenerEfectivoCobradoDeCaja, obtenerTokenFudo } from "@/lib/fudo";

const inicioDeHoy = () => inicioDelDia();

/** Turno de hoy, que además define en qué sucursal le toca fichar. */
async function turnoDeHoy(empleadoId: string) {
  return db.turno.findFirst({
    where: { empleadoId, fecha: comoFechaSql() },
    orderBy: { inicioAt: "asc" },
  });
}

export async function GET() {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [fichajesHoy, turno] = await Promise.all([
    db.fichaje.findMany({
      where: { empleadoId: session.empleadoId, timestamp: { gte: inicioDeHoy() } },
      orderBy: { timestamp: "asc" },
    }),
    turnoDeHoy(session.empleadoId!),
  ]);

  const local = await db.local.findUnique({ where: { id: turno?.localId ?? session.localId! } });

  const estado = calcularHoras(fichajesHoy, { descuentaDescanso: local?.descuentaDescanso });

  return NextResponse.json({
    fichajesHoy,
    proximoTipo: proximoFichaje(estado),
    puedeDescansar: estado.abierto || estado.enDescanso,
    horasTrabajadas: estado.horasTrabajadas,
    turno: turno && { horaInicio: turno.horaInicio, horaFin: turno.horaFin },
  });
}

export async function POST(request: Request) {
  const session = await requireEmpleadoApi();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody<{
    lat?: number;
    lng?: number;
    tipo?: string;
    rostroDescriptor?: unknown;
    rostroFoto?: string;
    rostroMotivo?: string;
  }>(request);
  const lat = typeof body?.lat === "number" ? body.lat : null;
  const lng = typeof body?.lng === "number" ? body.lng : null;

  const [fichajesHoy, turno] = await Promise.all([
    db.fichaje.findMany({
      where: { empleadoId: session.empleadoId, timestamp: { gte: inicioDeHoy() } },
      orderBy: { timestamp: "asc" },
    }),
    turnoDeHoy(session.empleadoId!),
  ]);

  // Dónde ficha: manda el turno del día; si no tiene, la sucursal más cercana
  // entre las que tiene asignadas; si ninguna tiene ubicación, la principal.
  const local = turno
    ? await db.local.findUnique({ where: { id: turno.localId } })
    : await localMasCercano(session.empleadoId!, session.localId!, lat, lng);

  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 500 });

  let distanciaM: number | null = null;
  if (local.lat != null && local.lng != null) {
    if (lat == null || lng == null) {
      return NextResponse.json(
        { error: "Necesitamos tu ubicación para fichar. Activá el GPS y dale permiso al navegador." },
        { status: 400 }
      );
    }
    distanciaM = Math.round(distanciaMetros(lat, lng, local.lat, local.lng));
    if (distanciaM > local.radioMetros) {
      return NextResponse.json(
        {
          error: `Estás a ${distanciaM} m de ${local.nombre}. Tenés que estar a menos de ${local.radioMetros} m para fichar.`,
        },
        { status: 400 }
      );
    }
  }

  // Control de rostro. Nunca bloquea el fichaje: registra el resultado y, si no
  // cerró, guarda la foto para que el encargado pueda revisarlo. Un empleado no
  // puede quedarse sin fichar porque la cocina tenía vapor.
  const rostro = await verificarRostro({
    empleadoId: session.empleadoId!,
    exigido: local.verificarRostro,
    tolerancia: local.rostroTolerancia,
    descriptorRecibido: body?.rostroDescriptor,
    motivoCliente: body?.rostroMotivo,
    fotoRecibida: body?.rostroFoto,
  });

  // El tipo lo decide el servidor a partir del estado real, no el cliente: así
  // dos toques seguidos no pueden generar dos ENTRADAs.
  const estado = calcularHoras(fichajesHoy, { descuentaDescanso: local.descuentaDescanso });
  const automatico = proximoFichaje(estado);
  const tipo =
    body?.tipo === "DESCANSO_INICIO" && estado.abierto && !estado.enDescanso
      ? "DESCANSO_INICIO"
      : automatico;

  let efectivoEsperado: number | null = null;
  if (tipo === "SALIDA" && estado.entrada && local.fudoApiKey) {
    const empleado = await db.empleado.findUnique({
      where: { id: session.empleadoId! },
      select: { fudoCajaId: true },
    });
    efectivoEsperado = await calcularEfectivoEsperado(local, estado.entrada, empleado?.fudoCajaId ?? null);
  }

  const fichaje = await db.fichaje.create({
    data: {
      empleadoId: session.empleadoId!,
      localId: local.id,
      tipo,
      lat,
      lng,
      distanciaM,
      rostro: rostro.resultado,
      rostroDistancia: rostro.distancia,
      rostroFoto: rostro.foto?.datos ?? null,
      rostroFotoTipo: rostro.foto?.tipo ?? null,
      efectivoEsperado,
    },
  });

  return NextResponse.json({ fichaje, rostro: rostro.resultado });
}

/**
 * Compara el descriptor que mandó el navegador contra el registrado.
 *
 * La comparación es del lado del servidor a propósito: si el navegador
 * decidiera si la cara coincide, saltear el control sería tan fácil como
 * mandar `true`. La foto se guarda sólo cuando el resultado no es OK.
 */
async function verificarRostro({
  empleadoId,
  exigido,
  tolerancia,
  descriptorRecibido,
  motivoCliente,
  fotoRecibida,
}: {
  empleadoId: string;
  exigido: boolean;
  tolerancia: number;
  descriptorRecibido: unknown;
  motivoCliente: string | undefined;
  fotoRecibida: string | undefined;
}): Promise<{
  resultado: VerificacionRostro;
  distancia: number | null;
  foto: ImagenSubida | null;
}> {
  if (!exigido) return { resultado: "OMITIDA", distancia: null, foto: null };

  const empleado = await db.empleado.findUnique({
    where: { id: empleadoId },
    select: { rostroDescriptor: true },
  });
  const registrado = bytesADescriptor(empleado?.rostroDescriptor);
  if (!registrado) return { resultado: "NO_REGISTRADO", distancia: null, foto: null };

  const foto = fotoRecibida ? leerDataUrl(fotoRecibida) : null;

  // El navegador no encontró cara, encontró varias, o no pudo usar la cámara.
  const descriptor = descriptorDesdeJson(descriptorRecibido);
  if (!descriptor) {
    return {
      resultado: motivoCliente === "OMITIDA" ? "OMITIDA" : "SIN_ROSTRO",
      distancia: null,
      foto,
    };
  }

  const distancia = distanciaRostros(descriptor, registrado);
  const coincide = distancia <= tolerancia;

  return {
    resultado: coincide ? "OK" : "NO_COINCIDE",
    distancia: Math.round(distancia * 1000) / 1000,
    // Sólo se guarda evidencia de lo que no cerró.
    foto: coincide ? null : foto,
  };
}

/**
 * Efectivo que Fudo registró cobrado entre la entrada y esta salida, para el
 * arqueo de caja. Sólo corre si el local tiene Fudo configurado; si la
 * consulta falla (Fudo caído, credenciales vencidas) no bloquea el fichaje,
 * simplemente no se arma el arqueo de esta salida.
 *
 * Si el empleado tiene su caja de Fudo vinculada (`fudoCajaId`), se suma
 * SÓLO lo que pasó por esa caja — mucho más preciso que sumar todo el
 * efectivo del local mientras estuvo fichado, que es el respaldo cuando
 * todavía no se vinculó.
 */
async function calcularEfectivoEsperado(
  local: { fudoApiKey: string | null; fudoApiSecret: string | null },
  entrada: Date,
  fudoCajaId: string | null
): Promise<number | null> {
  if (!local.fudoApiKey || !local.fudoApiSecret) return null;
  try {
    const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
    if (fudoCajaId) {
      return await obtenerEfectivoCobradoDeCaja(token, entrada, new Date(), fudoCajaId);
    }
    return await obtenerEfectivoCobrado(token, entrada, new Date());
  } catch {
    return null;
  }
}

async function localMasCercano(
  empleadoId: string,
  localPrincipalId: string,
  lat: number | null,
  lng: number | null
) {
  const asignaciones = await db.asignacionLocal.findMany({
    where: { empleadoId },
    include: { local: true },
  });
  const principal = await db.local.findUnique({ where: { id: localPrincipalId } });

  const candidatos = [principal, ...asignaciones.map((a) => a.local)].filter(
    (l): l is NonNullable<typeof principal> => l !== null
  );

  if (lat == null || lng == null) return principal;

  const conGeo = candidatos.filter((l) => l.lat != null && l.lng != null);
  if (conGeo.length === 0) return principal;

  return conGeo.reduce((mejor, l) =>
    distanciaMetros(lat, lng, l.lat!, l.lng!) < distanciaMetros(lat, lng, mejor.lat!, mejor.lng!)
      ? l
      : mejor
  );
}
