import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ordenarMedios } from "@/lib/ventas/importarFudo";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado } from "@/lib/ventas/sesion";

/** La carta activa del local y sus medios de pago, para la pantalla de pedido. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();

  const [categorias, productos, medios, cocinas] = await Promise.all([
    db.categoriaVenta.findMany({
      where: { localId },
      select: { id: true, nombre: true, padreId: true, orden: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    db.productoVenta.findMany({
      where: { localId, activo: true },
      select: { id: true, nombre: true, precio: true, categoriaId: true, favorito: true, codigo: true, cocinaId: true, categoria: { select: { cocinaId: true } } },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    db.medioPago.findMany({
      where: { localId, activo: true },
      select: { id: true, nombre: true, tipo: true },
      orderBy: { orden: "asc" },
    }),
    // En orden fijo por nombre: el color de cada cocina sale de su lugar acá.
    db.cocina.findMany({ where: { localId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  // Sólo las categorías que tienen algo para vender (o hijas que lo tienen).
  const conProductos = new Set(productos.map((p) => p.categoriaId));
  for (const c of categorias) if (conProductos.has(c.id) && c.padreId) conProductos.add(c.padreId);
  return NextResponse.json({
    categorias: categorias.filter((c) => conProductos.has(c.id)),
    productos: productos.map(({ categoria, ...p }) => ({ ...p, cocinaId: p.cocinaId ?? categoria.cocinaId })),
    medios: ordenarMedios(medios),
    cocinas,
  });
}
