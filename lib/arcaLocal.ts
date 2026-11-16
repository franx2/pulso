import { db } from "@/lib/db";
import { loginArca, type CredencialesArca, type TicketArca } from "@/lib/arca";

export type FacturadorLocal = { credenciales: CredencialesArca; ticket: TicketArca; puntoVenta: number };

// ponytail: dedupe de logins en memoria; alcanza con una sola instancia en Railway. Con varias, un lock en la base.
const enCurso = new Map<string, Promise<TicketArca>>();

/**
 * Lo necesario para facturar con el CUIT de un local: credenciales, punto de
 * venta y un ticket de ARCA vigente. Reusa el ticket guardado y sólo pide
 * otro cuando le queda menos de 10 minutos.
 */
export async function facturadorDelLocal(localId: string): Promise<FacturadorLocal> {
  const l = await db.local.findUniqueOrThrow({
    where: { id: localId },
    select: {
      nombre: true,
      cuitCompras: true,
      arcaCertificado: true,
      arcaClave: true,
      arcaPuntoVenta: true,
      arcaProduccion: true,
      arcaToken: true,
      arcaSign: true,
      arcaTicketVence: true,
    },
  });
  if (!l.cuitCompras || !l.arcaCertificado || !l.arcaClave || !l.arcaPuntoVenta) {
    throw new Error(`${l.nombre} no tiene cargados el CUIT, el certificado de ARCA o el punto de venta`);
  }
  const credenciales: CredencialesArca = {
    cuit: l.cuitCompras.replace(/\D/g, ""),
    certificado: l.arcaCertificado,
    clave: l.arcaClave,
    produccion: l.arcaProduccion,
  };

  if (l.arcaToken && l.arcaSign && l.arcaTicketVence && l.arcaTicketVence.getTime() > Date.now() + 600_000) {
    return { credenciales, ticket: { token: l.arcaToken, sign: l.arcaSign, vence: l.arcaTicketVence }, puntoVenta: l.arcaPuntoVenta };
  }

  let pedido = enCurso.get(localId);
  if (!pedido) {
    pedido = loginArca(credenciales)
      .then(async (t) => {
        await db.local.update({ where: { id: localId }, data: { arcaToken: t.token, arcaSign: t.sign, arcaTicketVence: t.vence } });
        return t;
      })
      .finally(() => enCurso.delete(localId));
    enCurso.set(localId, pedido);
  }
  return { credenciales, ticket: await pedido, puntoVenta: l.arcaPuntoVenta };
}
