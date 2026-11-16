import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ordenarMedios } from "@/lib/ventas/importarFudo";
import { contextoVentas, noAutenticado } from "@/lib/ventas/sesion";

/** La carta activa del local y sus medios de pago, para la pantalla de pedido. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const localId = new URL(request.url).searchParams.get("localId") ?? "";

  const [categorias, productos, medios] = await Promise.all([
    db.categoriaVenta.findMany({
      where: { localId },
      select: { id: true, nombre: true, padreId: true, orden: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    db.productoVenta.findMany({
      where: { localId, activo: true },
      select: { id: true, nombre: true, precio: true, categoriaId: true, favorito: true, codigo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    db.medioPago.findMany({
      where: { localId, activo: true },
      select: { id: true, nombre: true, tipo: true },
      orderBy: { orden: "asc" },
    }),
  ]);

  // Sólo las categorías que tienen algo para vender (o hijas que lo tienen).
  const conProductos = new Set(productos.map((p) => p.categoriaId));
  for (const c of categorias) if (conProductos.has(c.id) && c.padreId) conProductos.add(c.padreId);
  return NextResponse.json({ categorias: categorias.filter((c) => conProductos.has(c.id)), productos, medios: ordenarMedios(medios) });
}
