import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { TIPO_CBTE, urlQrArca } from "@/lib/arca";
import { requireEmpleado } from "@/lib/session";
import { ventaCompleta } from "@/lib/ventas/consultas";
import AutoImprimir from "./AutoImprimir";

/**
 * Lo que sale por la impresora térmica (80 mm): la comanda de cada cocina,
 * la precuenta para la mesa o el ticket de la venta cerrada. El ticket es
 * factura (con CAE y QR) sólo si ARCA la autorizó; si no, dice que no vale.
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
    const facturas = venta.factura.comprobantes.filter((c) => c.tipo === TIPO_CBTE.FACTURA_A || c.tipo === TIPO_CBTE.FACTURA_B);
    const factura = tipo === "ticket" ? (facturas.find((c) => c.cae) ?? null) : null;
    const pendiente = tipo === "ticket" && !factura && facturas.length > 0;
    const esA = factura?.tipo === TIPO_CBTE.FACTURA_A;
    // En la Factura A los precios van sin IVA: el IVA se discrimina abajo.
    const precio = (n: number) => (esA ? plata2(n / 1.21) : plata(n));
    const emisor = venta.factura.emisor;
    const qr =
      factura?.cae && factura.numero && factura.emitidoEn && emisor.cuit
        ? await QRCode.toString(
            urlQrArca({
              fecha: new Date(factura.emitidoEn),
              cuit: emisor.cuit,
              ptoVta: factura.puntoVenta,
              tipo: factura.tipo,
              numero: factura.numero,
              total: factura.total,
              docTipo: factura.docTipo,
              docNro: factura.docNro,
              cae: factura.cae,
            }),
            { type: "svg", margin: 0, errorCorrectionLevel: "M" }
          )
        : null;
    cuerpo = (
      <section className="hoja">
        {factura ? (
          <>
            <p className="centro grande">{emisor.razonSocial ?? venta.local.nombre}</p>
            <p className="centro">CUIT {formatoCuit(emisor.cuit ?? "")}</p>
            <p className="centro">IVA Responsable Inscripto</p>
            {(emisor.datos ?? "").split("\n").filter(Boolean).map((linea) => (
              <p key={linea} className="centro">
                {linea}
              </p>
            ))}
            <hr />
            <p className="centro grande">
              FACTURA {esA ? "A" : "B"} <span className="chico">(cód. {String(factura.tipo).padStart(3, "0")})</span>
            </p>
            <p className="centro">
              N° {String(factura.puntoVenta).padStart(4, "0")}-{String(factura.numero).padStart(8, "0")}
            </p>
            <p className="centro">{fechaHora(factura.emitidoEn!)}</p>
            {esA ? (
              <p className="centro">
                Cliente CUIT {formatoCuit(factura.docNro)} · {factura.condicionIvaReceptor === 6 ? "Monotributo" : "IVA Resp. Inscripto"}
              </p>
            ) : (
              <p className="centro">A consumidor final</p>
            )}
            {!factura.produccion && <p className="centro grande">PRUEBA · SIN VALIDEZ FISCAL</p>}
            <hr />
          </>
        ) : null}
        <p className={factura ? "centro" : "centro grande"}>{venta.local.nombre}</p>
        {!factura && <p className="centro">{tipo === "ticket" ? "TICKET" : "PRECUENTA"}</p>}
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
            <span>{precio(i.precio * i.cantidad)}</span>
          </div>
        ))}
        <hr />
        {venta.descuento > 0 && (
          <>
            <div className="fila">
              <span>Subtotal</span>
              <span>{precio(venta.subtotal)}</span>
            </div>
            <div className="fila">
              <span>Descuento</span>
              <span>-{precio(venta.descuento)}</span>
            </div>
          </>
        )}
        {esA && factura && (
          <>
            <div className="fila">
              <span>Neto gravado</span>
              <span>{plata2(factura.neto)}</span>
            </div>
            <div className="fila">
              <span>IVA 21%</span>
              <span>{plata2(factura.iva)}</span>
            </div>
          </>
        )}
        <div className="fila grande">
          <span>TOTAL</span>
          <span>{factura ? plata2(factura.total) : plata(venta.total)}</span>
        </div>
        {factura && !esA && (
          <>
            <p className="chico">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</p>
            <div className="fila">
              <span>IVA contenido</span>
              <span>{plata2(factura.iva)}</span>
            </div>
          </>
        )}
        {tipo === "precuenta" && venta.local.propinaSugeridaPct && (
          <>
            <hr />
            <div className="fila">
              <span>Propina sugerida {venta.local.propinaSugeridaPct}%</span>
              <span>{plata((venta.total * venta.local.propinaSugeridaPct) / 100)}</span>
            </div>
            <div className="fila">
              <span>Total con propina</span>
              <span>{plata(venta.total * (1 + venta.local.propinaSugeridaPct / 100))}</span>
            </div>
            <p className="chico">La propina es voluntaria.</p>
          </>
        )}
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
        {factura ? (
          <>
            <p>CAE: {factura.cae}</p>
            <p>Vto. CAE: {factura.caeVence?.split("-").reverse().join("/")}</p>
            {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
            <p className="centro chico">Comprobante autorizado por ARCA</p>
          </>
        ) : (
          <>
            <p className="centro">NO VÁLIDO COMO FACTURA</p>
            {pendiente && <p className="centro chico">Factura pendiente de ARCA: se reintenta sola</p>}
          </>
        )}
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
        .ticket .chico { font-size: 11px; font-weight: 400; }
        .ticket .qr { width: 32mm; margin: 6px auto; }
        .ticket .qr svg { width: 100%; height: auto; display: block; }
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

const plata2 = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatoCuit = (c: string) => c.replace(/\D/g, "").replace(/^(\d{2})(\d{8})(\d)$/, "$1-$2-$3");
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
