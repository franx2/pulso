import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diaDeFechaSql, fechaSql } from "@/lib/fechaAR";
import { rangoDias } from "@/lib/periodo";
import { requireAdminApi } from "@/lib/session";
import { IVA } from "@/lib/compras/impuestos";
import { claveProducto } from "@/lib/compras/sectores";
import type { GramosHelado } from "@/lib/compras/consumoHelado";
import { costear, costoDeReventa, insumoDe, preciosDeInsumos, ultimosPrecios, type Costeo } from "@/lib/compras/recetas";

export const maxDuration = 60;

/** Cuánto para atrás se buscan precios: alcanza para tener todo lo vigente. */
const DIAS_PRECIOS = 120;
/** Una suba "reciente", la que todavía puede no estar en el precio de carta. */
const DIAS_SUBA = 60;
/**
 * Fudo trae costos cargados a mano que a veces son un ingrediente suelto ($37
 * un jugo, $351 un kilo de helado). Debajo del 10% del precio no es un costo.
 */
const PISO_COSTO_FUDO = 0.1;

const menos = (dia: string, dias: number) => new Date(Date.parse(dia) - dias * 86_400_000).toISOString().slice(0, 10);

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const localId = params.get("localId") || null;
  const { desde, hasta, dias } = rangoDias(params);

  const [ventas, lineas, equivalencias, locales] = await Promise.all([
    db.productoDiario.groupBy({
      by: ["producto"],
      where: { fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) }, ...(localId ? { localId } : {}) },
      _sum: { cantidad: true, facturacion: true, costo: true },
    }),
    // Los precios: el proveedor es el mismo para los cuatro locales, así que
    // sirven las compras de cualquiera.
    db.compraItem.findMany({
      where: { compra: { tipo: "MERCADERIA", fecha: { gte: fechaSql(menos(hasta, DIAS_PRECIOS)), lte: fechaSql(hasta) } } },
      select: { detalle: true, precioUnitario: true, compra: { select: { fecha: true, ivaCredito: true } } },
    }),
    db.equivalenciaHelado.findMany({ select: { formato: true, gramos: true } }),
    db.local.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const ultimos = ultimosPrecios(
    lineas.map((l) => ({
      detalle: l.detalle,
      precioUnitario: l.precioUnitario,
      fecha: diaDeFechaSql(l.compra.fecha),
      esFactura: l.compra.ivaCredito != null,
    }))
  );
  const precios = preciosDeInsumos(ultimos);
  const gramosHelado: GramosHelado = Object.fromEntries(equivalencias.map((e) => [e.formato, e.gramos]));

  // El mismo producto se escribe "MEDIALUNA" en un local y "MEDIALUNA." en otro.
  const agrupadas = new Map<string, { producto: string; cantidad: number; facturacion: number; costoFudo: number }>();
  for (const v of ventas) {
    const clave = claveProducto(v.producto).replace(/[.\s]+$/, "");
    const fila = agrupadas.get(clave) ?? { producto: v.producto, cantidad: 0, facturacion: 0, costoFudo: 0 };
    fila.cantidad += v._sum.cantidad ?? 0;
    fila.facturacion += v._sum.facturacion ?? 0;
    fila.costoFudo += v._sum.costo ?? 0;
    agrupadas.set(clave, fila);
  }

  const productos = [...agrupadas.values()]
    .filter((f) => f.cantidad > 0 && f.facturacion > 0)
    .map((f) => {
      const venta = f.facturacion / (1 + IVA);
      const precio = venta / f.cantidad;
      let fuente: "receta" | "proveedor" | "fudo" | null = null;
      let costeo: Costeo | null = costear(f.producto, precios, gramosHelado);
      if (costeo) fuente = "receta";
      else if ((costeo = costoDeReventa(f.producto, ultimos))) fuente = "proveedor";
      else if (f.costoFudo / f.cantidad >= precio * PISO_COSTO_FUDO) {
        fuente = "fudo";
        costeo = { receta: "Costo cargado en Fudo", costo: f.costoFudo / f.cantidad, componentes: [], faltan: [] };
      }
      // Una receta con todos sus insumos sin precio no es un costo de cero.
      const costo = costeo && costeo.costo > 0 ? costeo.costo : null;
      return {
        producto: f.producto,
        cantidad: f.cantidad,
        venta,
        precio,
        costo,
        margenPct: costo != null ? ((precio - costo) / precio) * 100 : null,
        fuente: costo != null ? fuente : null,
        receta: costeo?.receta ?? null,
        supuesto: costeo?.supuesto ?? null,
        faltan: costeo?.faltan ?? [],
        componentes: costeo?.componentes ?? [],
      };
    })
    .sort((a, b) => b.venta - a.venta);

  const venta = productos.reduce((s, p) => s + p.venta, 0);
  const conCosto = productos.filter((p) => p.costo != null);
  const ventaCosteada = conCosto.reduce((s, p) => s + p.venta, 0);
  const costoTotal = conCosto.reduce((s, p) => s + p.costo! * p.cantidad, 0);

  // Las subas recientes de lo que se usa o se revende, con a qué productos les pega.
  const limiteSuba = menos(hasta, DIAS_SUBA);
  const subas = [...ultimos.entries()]
    .filter(([, u]) => u.anterior && u.vigenteDesde && u.vigenteDesde >= limiteSuba && u.precio / u.anterior > 1.02)
    .map(([clave, u]) => {
      const insumo = insumoDe(clave);
      const nombre = insumo?.nombre ?? u.detalle;
      const afecta = conCosto.filter((p) => p.componentes.some((c) => c.nombre === nombre || c.nombre === u.detalle));
      return {
        detalle: u.detalle,
        insumo: insumo?.nombre ?? null,
        anterior: u.anterior!,
        precio: u.precio,
        subaPct: (u.precio / u.anterior! - 1) * 100,
        desde: u.vigenteDesde!,
        afecta: afecta.slice(0, 3).map((p) => p.producto),
        ventaAfectada: afecta.reduce((s, p) => s + p.venta, 0),
      };
    })
    .filter((s) => s.afecta.length > 0);
  // Los 20 sabores de helado que subieron juntos son una sola suba.
  const porInsumo = new Map<string, (typeof subas)[number]>();
  for (const s of subas) {
    const previa = porInsumo.get(s.insumo ?? s.detalle);
    if (!previa || s.desde > previa.desde) porInsumo.set(s.insumo ?? s.detalle, s);
  }
  const subasAgrupadas = [...porInsumo.values()].sort((a, b) => b.ventaAfectada - a.ventaAfectada);

  return NextResponse.json({
    desde,
    hasta,
    dias,
    localId: localId ?? "",
    locales,
    resumen: {
      venta,
      ventaCosteada,
      costo: costoTotal,
      costoPct: ventaCosteada > 0 ? (costoTotal / ventaCosteada) * 100 : null,
      cobertura: venta > 0 ? (ventaCosteada / venta) * 100 : 0,
    },
    productos,
    subas: subasAgrupadas,
  });
}
