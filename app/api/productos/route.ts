import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/session";

/**
 * Análisis de productos sobre `ProductoDiario`: qué factura, qué casi no
 * sale, y el mismo producto comparado entre sucursales — que es la lectura
 * que sólo aparece cuando hay más de un local cargado.
 */

/** Sin esto, un producto que se vende en un solo local aparecería como
 * "precio distinto" apenas cambia de mes. Se compara sólo lo que se vendió
 * en al menos dos sucursales. */
const MIN_LOCALES_PARA_COMPARAR = 2;
/** Diferencia de precio que ya no se explica por redondeo o una promo suelta. */
const DIF_PRECIO_ALERTA = 10;

function fechaSql(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

export async function GET(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const localId = searchParams.get("localId") || undefined;
  if (!desde || !hasta) return NextResponse.json({ error: "Faltan fechas" }, { status: 400 });

  const [filas, locales] = await Promise.all([
    db.productoDiario.findMany({
      where: {
        fecha: { gte: fechaSql(desde), lte: fechaSql(hasta) },
        ...(localId ? { localId } : {}),
      },
    }),
    db.local.findMany({ select: { id: true, nombre: true } }),
  ]);

  const nombreLocal = new Map(locales.map((l) => [l.id, l.nombre]));

  // Por producto (id de Fudo es por cuenta, así que entre locales se cruza
  // por nombre: es lo único común entre cuentas separadas de Fudo).
  type Acc = {
    nombre: string;
    categoria: string | null;
    cantidad: number;
    facturacion: number;
    costo: number;
    porLocal: Map<string, { cantidad: number; facturacion: number }>;
  };
  const porProducto = new Map<string, Acc>();

  for (const f of filas) {
    const clave = f.producto.trim().toUpperCase();
    let acc = porProducto.get(clave);
    if (!acc) {
      acc = {
        nombre: f.producto,
        categoria: f.categoria,
        cantidad: 0,
        facturacion: 0,
        costo: 0,
        porLocal: new Map(),
      };
      porProducto.set(clave, acc);
    }
    acc.cantidad += f.cantidad;
    acc.facturacion += f.facturacion;
    acc.costo += f.costo;
    const l = acc.porLocal.get(f.localId) ?? { cantidad: 0, facturacion: 0 };
    l.cantidad += f.cantidad;
    l.facturacion += f.facturacion;
    acc.porLocal.set(f.localId, l);
  }

  const productos = [...porProducto.values()].map((p) => {
    const precioPromedio = p.cantidad > 0 ? p.facturacion / p.cantidad : 0;
    return {
      nombre: p.nombre,
      categoria: p.categoria,
      cantidad: p.cantidad,
      facturacion: p.facturacion,
      costo: p.costo,
      precioPromedio,
      margen: p.facturacion > 0 && p.costo > 0 ? ((p.facturacion - p.costo) / p.facturacion) * 100 : null,
      locales: [...p.porLocal.entries()].map(([id, v]) => ({
        local: nombreLocal.get(id) ?? "—",
        cantidad: v.cantidad,
        facturacion: v.facturacion,
        precioPromedio: v.cantidad > 0 ? v.facturacion / v.cantidad : 0,
      })),
    };
  });

  const porFacturacion = [...productos].sort((a, b) => b.facturacion - a.facturacion);
  const porCantidad = [...productos].sort((a, b) => b.cantidad - a.cantidad);

  // Mismo producto, precio distinto entre sucursales: o es una lista de
  // precios desactualizada, o alguien cobra distinto. Las dos importan.
  const preciosDispares = productos
    .filter((p) => p.locales.length >= MIN_LOCALES_PARA_COMPARAR)
    .map((p) => {
      const precios = p.locales.map((l) => l.precioPromedio).filter((v) => v > 0);
      // Con menos de dos precios válidos no hay nada que comparar (y
      // Math.min de un array vacío devuelve Infinity, que ensucia la cuenta).
      if (precios.length < 2) return { ...p, min: 0, max: 0, difPct: 0 };
      const min = Math.min(...precios);
      const max = Math.max(...precios);
      return { ...p, min, max, difPct: ((max - min) / min) * 100 };
    })
    .filter((p) => p.difPct >= DIF_PRECIO_ALERTA)
    .sort((a, b) => b.difPct - a.difPct)
    .slice(0, 15);

  // "Se vende en un local y en otro no" separa un problema de carta o de
  // exhibición de un simple producto flojo.
  const localesConVenta = new Set(filas.map((f) => f.localId)).size;
  const desparejos = productos
    .filter((p) => localesConVenta > 1 && p.locales.length === 1 && p.facturacion > 0)
    .sort((a, b) => b.facturacion - a.facturacion)
    .slice(0, 15)
    .map((p) => ({ nombre: p.nombre, local: p.locales[0].local, facturacion: p.facturacion }));

  return NextResponse.json({
    totalProductos: productos.length,
    masVendidos: porCantidad.slice(0, 15),
    masFacturan: porFacturacion.slice(0, 15),
    // "Menos vendidos" son los que salieron pero casi nada: un producto con 0
    // ventas no está en los datos (la fila nace de una venta), así que esto
    // muestra la cola, no el catálogo entero sin vender.
    menosVendidos: [...porCantidad].reverse().slice(0, 15),
    preciosDispares,
    desparejos,
  });
}
