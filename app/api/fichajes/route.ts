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
import {
  obtenerEfectivoCobrado,
  obtenerEfectivoCobradoDeCaja,
  obtenerGastosEnEfectivoDeCaja,
  obtenerTokenFudo,
} from "@/lib/fudo";

const inicioDeHoy = () => inicioDelDia();

/** Turno de hoy, que además define en qué sucursal le toca fichar. */
async function turnoDeHoy(empleadoId: string) {
  return db.turno.findFirst({
    where: { empleadoId, fecha: comoFechaSql() },
    orderBy: { inicioAt: "asc" },
  });
}

/** Si el local tiene Fudo y el empleado tiene su caja vinculada, se le pide
 * el fondo inicial al abrir y el arqueo de salida lo suma a lo vendido —
 * si no, no aplica (el respaldo sin caja vinculada no modela un fondo). */
async function fudoCajaDelEmpleado(empleadoId: string): Promise<string | null> {
  const e = await db.empleado.findUnique({ where: { id: empleadoId }, select: { fudoCajaId: true } });
  return e?.fudoCajaId ?? null;
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

  const usaCaja = local?.fudoApiKey ? Boolean(await fudoCajaDelEmpleado(session.empleadoId!)) : false;

  return NextResponse.json({
    fichajesHoy,
    proximoTipo: proximoFichaje(estado),
    puedeDescansar: estado.abierto || estado.enDescanso,
    horasTrabajadas: estado.horasTrabajadas,
    turno: turno && { horaInicio: turno.horaInicio, horaFin: turno.horaFin },
    usaCaja,
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

  const cajaId = local.fudoApiKey ? await fudoCajaDelEmpleado(session.empleadoId!) : null;
  // Al abrir con caja vinculada, se le pide el fondo inicial aparte (ver
  // /api/fichajes/[id]/fondo-inicial) — acá sólo se avisa que corresponde.
  const usaCaja = tipo === "ENTRADA" && Boolean(cajaId);

  let efectivoEsperado: number | null = null;
  let fondoInicial: number | null = null;
  let efectivoVendido: number | null = null;
  let gastosEfectivo: number | null = null;
  if (tipo === "SALIDA" && estado.entrada && local.fudoApiKey) {
    if (cajaId) {
      // El fondo vive en el fichaje de ENTRADA de hoy: sin él no se inventa
      // un esperado que subestimaría lo que debería haber en la caja.
      const entradaFichaje = fichajesHoy.find((f) => f.tipo === "ENTRADA");
      fondoInicial = entradaFichaje?.fondoInicial ?? null;
      if (fondoInicial != null) {
        const arqueo = await calcularArqueoDeCaja(local, estado.entrada, cajaId);
        if (arqueo) {
          efectivoVendido = arqueo.vendido;
          gastosEfectivo = arqueo.gastos;
          // Lo que tiene que haber en el cajón: lo que había + lo que entró
          // en efectivo − lo que salió pagando algo desde la caja.
          efectivoEsperado = fondoInicial + arqueo.vendido - arqueo.gastos;
        }
      }
    } else {
      efectivoEsperado = await calcularEfectivoEsperado(local, estado.entrada);
    }
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

  return NextResponse.json({
    fichaje,
    rostro: rostro.resultado,
    usaCaja,
    fondoInicial,
    efectivoVendido,
    gastosEfectivo,
  });
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
 * Arqueo de la caja del empleado entre su entrada y esta salida: lo que
 * entró en efectivo y lo que salió pagando gastos desde ese mismo cajón.
 * Si Fudo falla (caído, credenciales vencidas) devuelve null y el fichaje
 * sigue igual — no se arma el arqueo, pero nunca se bloquea la salida.
 */
async function calcularArqueoDeCaja(
  local: { fudoApiKey: string | null; fudoApiSecret: string | null },
  entrada: Date,
  fudoCajaId: string
): Promise<{ vendido: number; gastos: number } | null> {
  if (!local.fudoApiKey || !local.fudoApiSecret) return null;
  try {
    const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
    const hasta = new Date();
    const [vendido, gastos] = await Promise.all([
      obtenerEfectivoCobradoDeCaja(token, entrada, hasta, fudoCajaId),
      obtenerGastosEnEfectivoDeCaja(token, entrada, hasta, fudoCajaId),
    ]);
    return { vendido, gastos };
  } catch {
    return null;
  }
}

/**
 * Respaldo para cuando el empleado todavía no tiene su caja de Fudo
 * vinculada: suma todo el efectivo cobrado en el local mientras estuvo
 * fichado. Es una aproximación — no distingue de quién fue la caja ni
 * descuenta gastos — y por eso tampoco modela un fondo inicial.
 */
async function calcularEfectivoEsperado(
  local: { fudoApiKey: string | null; fudoApiSecret: string | null },
  entrada: Date
): Promise<number | null> {
  if (!local.fudoApiKey || !local.fudoApiSecret) return null;
  try {
    const token = await obtenerTokenFudo(local.fudoApiKey, local.fudoApiSecret);
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
