import { notFound } from "next/navigation";
import { requireEmpleado } from "@/lib/session";
import { ventaCompleta } from "@/lib/ventas/consultas";
import AutoImprimir from "./AutoImprimir";

/**
 * Lo que sale por la impresora térmica (80 mm): la comanda de cada cocina,
 * la precuenta para la mesa o el ticket de la venta cerrada. Ninguno es un
 * comprobante fiscal, y lo dicen.
 */
export default async function ImprimirPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; enviadoEn?: string }>;
}) {
  await requireEmpleado();
  const { id } = await params;
  const { tipo = "precuenta", enviadoEn } = await searchParams;
  const venta = await ventaCompleta(id);
  if (!venta) notFound();

  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const donde = venta.mesa ? `MESA ${venta.mesa.numero} · ${venta.mesa.salon}` : `MOSTRADOR${venta.cliente ? ` · ${venta.cliente}` : ""}`;
  const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

  let cuerpo: React.ReactNode;
  if (tipo === "comanda") {
    const tanda = venta.items.filter((i) => !i.anulado && i.enviadoEn && (!enviadoEn || i.enviadoEn === enviadoEn));
    const porCocina = new Map<string, typeof tanda>();
    for (const i of tanda) porCocina.set(i.cocina?.nombre ?? "Sin cocina", [...(porCocina.get(i.cocina?.nombre ?? "Sin cocina") ?? []), i]);
    cuerpo = [...porCocina].map(([cocina, items]) => (
      <section key={cocina} className="hoja">
        <p className="grande">{cocina.toUpperCase()}</p>
        <p className="grande">{donde}</p>
        <p>
          #{venta.numero} · {ahora}
          {venta.mozo && ` · ${venta.mozo.nombre}`}
        </p>
        <hr />
        {items.map((i) => (
          <div key={i.id} className="item">
            <p className="grande">
              {i.cantidad} × {i.nombre}
            </p>
            {i.comentario && <p className="nota">» {i.comentario}</p>}
          </div>
        ))}
        {venta.comentario && (
          <>
            <hr />
            <p className="nota">Mesa: {venta.comentario}</p>
          </>
        )}
      </section>
    ));
  } else {
    const items = venta.items.filter((i) => !i.anulado);
    cuerpo = (
      <section className="hoja">
        <p className="centro grande">{venta.local.nombre}</p>
        <p className="centro">{tipo === "ticket" ? "TICKET" : "PRECUENTA"}</p>
        <p className="centro">
          {donde} · #{venta.numero}
        </p>
        <p className="centro">{ahora}</p>
        <hr />
        {items.map((i) => (
          <div key={i.id} className="fila">
            <span>
              {i.cantidad} {i.nombre}
            </span>
            <span>{plata(i.precio * i.cantidad)}</span>
          </div>
        ))}
        <hr />
        {venta.descuento > 0 && (
          <>
            <div className="fila">
              <span>Subtotal</span>
              <span>{plata(venta.subtotal)}</span>
            </div>
            <div className="fila">
              <span>Descuento</span>
              <span>-{plata(venta.descuento)}</span>
            </div>
          </>
        )}
        <div className="fila grande">
          <span>TOTAL</span>
          <span>{plata(venta.total)}</span>
        </div>
        {tipo === "ticket" &&
          venta.pagos
            .filter((p) => !p.anulado)
            .map((p) => (
              <div key={p.id} className="fila">
                <span>{p.medio}</span>
                <span>{plata(p.monto)}</span>
              </div>
            ))}
        <hr />
        <p className="centro">NO VÁLIDO COMO FACTURA</p>
        <p className="centro">¡Gracias por su visita!</p>
      </section>
    );
  }

  return (
    <main className="ticket">
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        html, body { background: #fff !important; color: #000 !important; }
        .ticket { width: 72mm; margin: 0 auto; padding: 4mm 0; font: 13px/1.35 ui-monospace, "Courier New", monospace; color: #000; }
        .ticket p { margin: 0; }
        .ticket hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        .ticket .grande { font-size: 16px; font-weight: 700; }
        .ticket .centro { text-align: center; }
        .ticket .nota { padding-left: 10px; font-style: italic; }
        .ticket .item { margin: 4px 0; }
        .ticket .fila { display: flex; justify-content: space-between; gap: 8px; }
        .ticket .hoja + .hoja { break-before: page; margin-top: 12px; border-top: 2px solid #000; padding-top: 8px; }
        @media screen { .ticket { box-shadow: 0 0 0 1px #e2e8f0; } }
      `}</style>
      {cuerpo}
      <AutoImprimir />
    </main>
  );
}
