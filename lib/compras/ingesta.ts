/**
 * De un PDF de remito a una compra guardada.
 *
 * Las dos decisiones que toma este módulo —a qué local va y si es mercadería
 * o un servicio— pueden estar mal, y la respuesta a eso no es afinar la
 * heurística: es no adivinar. Un remito que no se puede asignar con certeza
 * queda sin local y aparece en la bandeja para que alguien lo diga. Meterlo
 * en el local equivocado ensucia el costo de dos locales a la vez y nadie lo
 * nota.
 */

import type { TipoCompra } from "@prisma/client";
import { db } from "@/lib/db";
import { fechaSql, sumarDias } from "@/lib/fechaAR";
import { textoDePdf } from "@/lib/compras/pdf";
import { costoPorLinea, mesDeRoyalty, parsearRemito, verificarRemito, type RemitoParseado } from "@/lib/compras/remito";
import { pareceFactura, parsearFactura, verificarFactura, type FacturaParseada } from "@/lib/compras/factura";

/**
 * Conceptos que NO son mercadería y no pueden entrar al food cost.
 *
 * El royalty de marca de agosto fue $1.124.160: más que toda una semana de
 * compras. Sumado al café, el food cost del mes deja de significar nada.
 */
const PATRONES_SERVICIO = [/USO DE MARCA/i, /ROYALT/i, /CANON/i, /PUBLICIDAD/i, /FRANQUICIA/i];

export function clasificarRemito(remito: RemitoParseado): TipoCompra {
  const texto = `${remito.observaciones ?? ""} ${remito.lineas.map((l) => l.detalle).join(" ")}`;
  // Alcanza con que una línea sea un servicio: estos remitos vienen separados,
  // no mezclados con mercadería. Si alguna vez viniera mezclado, la
  // verificación de totales no se entera y hay que partirlo a mano.
  return PATRONES_SERVICIO.some((patron) => patron.test(texto)) ? "SERVICIO" : "MERCADERIA";
}

/** Saca puntuación y espacios para comparar razones sociales escritas distinto. */
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

export type LocalCompras = { id: string; nombre: string; cuitCompras: string | null; razonSocialCompras: string | null };

/**
 * A qué local corresponde el remito.
 *
 * Primero por CUIT, que no cambia nunca. Si el remito no lo trae, por razón
 * social exacta. **No hay coincidencia parcial a propósito**: "CUMBRES Y
 * PLACERES SAS (BIANCONERO GUAYMALLEN)" y una hipotética "CUMBRES Y PLACERES
 * SAS (BIANCONERO CHACRAS)" comparten casi todo el nombre, y errarle manda el
 * costo de un local al otro.
 */
export function asignarLocal(remito: RemitoParseado, locales: LocalCompras[]): LocalCompras | null {
  if (remito.cuit) {
    const porCuit = locales.filter((l) => l.cuitCompras && l.cuitCompras.replace(/\D/g, "") === remito.cuit);
    // Dos locales con el mismo CUIT es un error de configuración, no una
    // coincidencia: mejor sin asignar que en uno de los dos al azar.
    if (porCuit.length === 1) return porCuit[0];
    if (porCuit.length > 1) return null;
  }

  const cliente = normalizar(remito.cliente);
  const porNombre = locales.filter((l) => l.razonSocialCompras && normalizar(l.razonSocialCompras) === cliente);
  return porNombre.length === 1 ? porNombre[0] : null;
}

/**
 * El remito ya cargado que esta factura factura, si lo hay.
 *
 * Primero por el número de presupuesto ("REMITO 08/09 PPTO 5084" → remito
 * 16-5084), que es exacto: ese día puede haber dos remitos. Si la factura no
 * lo trae, por la fecha del remito en el mismo local.
 */
async function buscarRemitoFacturado(
  factura: FacturaParseada,
  localId: string
): Promise<{ id: string; numero: string } | null> {
  const ppto = factura.observaciones?.match(/PPTO\s*(\d+)/i)?.[1];
  if (ppto) {
    const porNumero = await db.compra.findFirst({
      where: { localId, numero: `${factura.puntoVenta}-${Number(ppto)}`, ivaCredito: null },
      select: { id: true, numero: true },
    });
    if (porNumero) return porNumero;
  }
  // El royalty no trae "REMITO dd/mm": se reconoce por el mes ("USO DE MARCA
  // SEPTIEMBRE"), y es el del mismo local emitido en los dos meses anteriores.
  const royalty = mesDeRoyalty(factura.observaciones);
  if (royalty) {
    return db.compra.findFirst({
      where: {
        localId,
        tipo: "SERVICIO",
        ivaCredito: null,
        reemplazadaPorId: null,
        observaciones: { startsWith: royalty, mode: "insensitive" },
        fecha: { gte: fechaSql(sumarDias(factura.fecha, -70)), lte: fechaSql(factura.fecha) },
      },
      select: { id: true, numero: true },
    });
  }
  if (!factura.remitoReferido) return null;
  // ponytail: por fecha toma un remito de ese día; si hubiera dos y la
  // factura no trae PPTO, reemplaza uno solo. Hasta ahora las que vienen sin
  // PPTO son de días con un único remito.
  return db.compra.findFirst({
    where: { localId, fecha: fechaSql(factura.remitoReferido), ivaCredito: null, reemplazadaPorId: null },
    select: { id: true, numero: true },
  });
}

/**
 * Al revés: un remito que llega cuando su factura ya está cargada (la factura
 * lo nombra con "PPTO 5084"). Nace reemplazado, para no sumar dos veces.
 */
async function facturaQueLoReemplaza(remito: RemitoParseado, localId: string): Promise<string | null> {
  const royalty = mesDeRoyalty(remito.observaciones);
  if (royalty) {
    const factura = await db.compra.findFirst({
      where: {
        localId,
        tipo: "SERVICIO",
        ivaCredito: { not: null },
        observaciones: { startsWith: royalty, mode: "insensitive" },
        fecha: { gte: fechaSql(remito.fecha), lte: fechaSql(sumarDias(remito.fecha, 70)) },
      },
      select: { id: true },
    });
    return factura?.id ?? null;
  }
  const candidatas = await db.compra.findMany({
    where: { localId, ivaCredito: { not: null }, observaciones: { contains: `PPTO ${remito.numeroComprobante}` } },
    select: { id: true, observaciones: true },
  });
  // `contains` dejaría pasar "PPTO 5084" buscando el 508: se confirma entero.
  const exacta = new RegExp(String.raw`PPTO\s*${remito.numeroComprobante}\b`, "i");
  return candidatas.find((c) => exacta.test(c.observaciones ?? ""))?.id ?? null;
}

export type ResultadoIngesta = {
  numero: string;
  estado: "guardado" | "duplicado" | "ilegible" | "no_es_remito";
  local: string | null;
  fecha: string | null;
  total: number | null;
  tipo: TipoCompra | null;
  problemas: string[];
};

/**
 * Procesa un PDF: lee, verifica, asigna y guarda.
 *
 * Un remito que no verifica se guarda igual pero marcado: perderlo sería peor,
 * y quien lo mire necesita ver qué se leyó para entender qué falló.
 */
export async function ingerirRemito(
  pdf: Uint8Array,
  contexto: { origen?: string; proveedor?: string } = {}
): Promise<ResultadoIngesta> {
  let remito: RemitoParseado;
  // Desde fines de octubre de 2026 llegan facturas A en vez de remitos.
  let factura: FacturaParseada | null = null;
  let texto = "";
  try {
    texto = await textoDePdf(pdf);
    if (pareceFactura(texto)) {
      factura = parsearFactura(texto);
      remito = factura;
    } else {
      remito = parsearRemito(texto);
    }
  } catch (error) {
    // El proveedor manda en el mismo mail el estado de cuenta además de los
    // remitos. Ese PDF no es un remito y nunca va a parsear: distinguirlo de
    // un remito roto importa, porque si no cada semana aparecerían errores
    // que no hay que investigar y los de verdad se perderían entre ellos.
    const parece =
      pareceFactura(texto) || (/Nro:\s*[\d.]+\s*-/.test(texto) && /C[óo]d\.\s*Producto/i.test(texto));
    return {
      numero: "?",
      estado: parece ? "ilegible" : "no_es_remito",
      local: null,
      fecha: null,
      total: null,
      tipo: null,
      problemas: parece ? [error instanceof Error ? error.message : "No se pudo leer el PDF"] : [],
    };
  }

  const locales = await db.local.findMany({
    select: { id: true, nombre: true, cuitCompras: true, razonSocialCompras: true },
    orderBy: { nombre: "asc" },
  });
  const local = asignarLocal(remito, locales);
  const verificacion = factura ? verificarFactura(factura) : verificarRemito(remito);
  const tipo = clasificarRemito(remito);
  const problemas = [...verificacion.problemas];

  if (!local) {
    problemas.push(
      `No pude asignar el local: el remito viene a nombre de "${remito.cliente}"` +
        (remito.cuit ? ` (CUIT ${remito.cuit})` : "") +
        ". Cargá ese CUIT en el local que corresponda."
    );
  }

  const yaEsta = await db.compra.findFirst({
    where: { puntoVenta: remito.puntoVenta, numero: remito.numero, cuit: remito.cuit },
    select: { id: true },
  });
  if (yaEsta) {
    return {
      numero: remito.numero,
      estado: "duplicado",
      local: local?.nombre ?? null,
      fecha: remito.fecha,
      total: remito.subtotal,
      tipo,
      problemas: [],
    };
  }

  // La factura de un remito ya cargado es la MISMA compra, y la factura es la
  // deuda real (decisión del 12/11/2026): se guarda la factura y el remito
  // pasa a "reemplazado", que ninguna suma cuenta. Pasa con todo lo de antes
  // de octubre, cuando llegaban los dos documentos.
  const remitoFacturado = factura && local ? await buscarRemitoFacturado(factura, local.id) : null;
  const reemplazadaPorId = !factura && local ? await facturaQueLoReemplaza(remito, local.id) : null;

  // En la factura, `total` es el neto de la línea y `totalConAjuste` lo que se
  // paga por ella, con su IVA: el mismo sentido que en el remito.
  const lineas = factura
    ? factura.lineas.map((l) => ({ ...l, costoLista: l.total, costoConAjuste: l.totalConIva }))
    : costoPorLinea(remito);
  const creada = await db.compra.create({
    data: {
      localId: local?.id ?? null,
      numero: remito.numero,
      puntoVenta: remito.puntoVenta,
      fecha: fechaSql(remito.fecha),
      proveedor: contexto.proveedor ?? "Bianconero",
      cliente: remito.cliente,
      cuit: remito.cuit,
      observaciones: remito.observaciones,
      sumaLineas: remito.sumaLineas,
      ajustePct: remito.ajustePct,
      subtotal: remito.subtotal,
      total: remito.total,
      tipo,
      ivaCredito: factura ? factura.iva : null,
      reemplazadaPorId,
      verificado: problemas.length === 0 && local != null,
      problemas,
      origen: contexto.origen ?? null,
      textoPlano: texto,
      items: {
        create: lineas.map((linea) => ({
          codigo: linea.codigo,
          detalle: linea.detalle,
          cantidad: linea.cantidad,
          cantidadExacta: linea.cantidadExacta,
          unidad: linea.unidad,
          precioUnitario: linea.precioUnitario,
          total: linea.costoLista,
          totalConAjuste: linea.costoConAjuste,
        })),
      },
    },
    select: { id: true },
  });
  if (remitoFacturado) {
    await db.compra.update({ where: { id: remitoFacturado.id }, data: { reemplazadaPorId: creada.id } });
    problemas.push(`Reemplaza al remito ${remitoFacturado.numero}, que deja de sumar.`);
  }

  return {
    numero: remito.numero,
    estado: "guardado",
    local: local?.nombre ?? null,
    fecha: remito.fecha,
    total: remito.subtotal,
    tipo,
    problemas,
  };
}
