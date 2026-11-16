import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readJsonBody } from "@/lib/http";
import { datosDeCliente, saldosDeClientes } from "@/lib/ventas/clientes";
import { contextoVentas, enLocal, fueraDeLocal, noAutenticado, sinPermiso } from "@/lib/ventas/sesion";

/** La libreta de clientes del local, con lo que debe cada uno. `q` busca por nombre, teléfono o documento. */
export async function GET(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const url = new URL(request.url);
  const localId = url.searchParams.get("localId") ?? "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const q = url.searchParams.get("q")?.trim() ?? "";

  const clientes = await db.cliente.findMany({
    where: {
      localId,
      activo: true,
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { telefono: { contains: q } },
              { documento: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { nombre: "asc" },
    take: 300,
    select: { id: true, nombre: true, telefono: true, email: true, documento: true, direccion: true, descuentoPct: true, notas: true },
  });
  const saldos = await saldosDeClientes(clientes.map((c) => c.id));
  return NextResponse.json({ clientes: clientes.map((c) => ({ ...c, saldo: saldos.get(c.id) ?? 0 })), permisos: ctx.permisos });
}

export async function POST(request: Request) {
  const ctx = await contextoVentas();
  if (!ctx) return noAutenticado();
  const prohibido = sinPermiso(ctx, "create_additions");
  if (prohibido) return prohibido;
  const body = await readJsonBody<Record<string, unknown>>(request);
  const localId = typeof body?.localId === "string" ? body.localId : "";
  if (!enLocal(ctx, localId)) return fueraDeLocal();
  const r = datosDeCliente(body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const c = await db.cliente.create({ data: { ...r.ok, nombre: r.ok.nombre!, localId }, select: { id: true, nombre: true, descuentoPct: true } });
  return NextResponse.json(c);
}
