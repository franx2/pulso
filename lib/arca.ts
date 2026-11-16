import { X509Certificate } from "node:crypto";

const DIA = 86_400_000;
const AVISAR_DIAS = 30;

/**
 * Aviso para el Dashboard si el certificado de ARCA de un local vence en
 * menos de un mes (o ya venció, o no se puede leer). Sin certificado cargado
 * no hay aviso: ese local todavía no factura.
 */
export function alertaCertificado(
  local: { id: string; nombre: string; arcaCertificado: string | null },
  hoy = new Date()
): { tono: "rose" | "amber"; texto: string; localId: string } | null {
  if (!local.arcaCertificado) return null;
  let vence: Date;
  try {
    vence = new Date(new X509Certificate(local.arcaCertificado).validTo);
  } catch {
    return { tono: "rose", texto: `${local.nombre}: el certificado de ARCA cargado no se puede leer`, localId: local.id };
  }
  const dias = Math.ceil((vence.getTime() - hoy.getTime()) / DIA);
  if (dias > AVISAR_DIAS) return null;
  const fecha = vence.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  if (dias <= 0) {
    return { tono: "rose", texto: `${local.nombre}: el certificado de ARCA venció el ${fecha}, no puede facturar`, localId: local.id };
  }
  return {
    tono: dias <= 7 ? "rose" : "amber",
    texto: `${local.nombre}: el certificado de ARCA vence el ${fecha} (en ${dias} ${dias === 1 ? "día" : "días"}), hay que renovarlo`,
    localId: local.id,
  };
}

// ─── Facturación electrónica (WSAA + WSFEv1) ────────────────────────────────

const URLS = {
  homo: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  prod: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
};

/** `cuit` es el del local que factura (el representado), no el del certificado. */
export type CredencialesArca = { cuit: string; certificado: string; clave: string; produccion: boolean };
/** Ticket de acceso de WSAA: vale ~12 h y ARCA no da otro mientras siga vigente. */
export type TicketArca = { token: string; sign: string; vence: Date };

/** Más que esto no se espera a ARCA: el comprobante queda pendiente y se reintenta. */
const ESPERA_MS = 15_000;

const entorno = (c: CredencialesArca) => (c.produccion ? URLS.prod : URLS.homo);
const des = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// ponytail: regex sobre el XML de ARCA, que tiene forma fija; parser si algún día hace falta leer estructuras más profundas.
const patron = (nombre: string, flags = "") =>
  new RegExp(`<(?:\\w+:)?${nombre}>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, flags);
const tag = (xml: string, nombre: string) => xml.match(patron(nombre))?.[1];
const todos = (xml: string, nombre: string) => [...xml.matchAll(patron(nombre, "g"))].map((m) => m[1]);

/** Pide el ticket de acceso firmando el pedido (CMS) con el certificado del local. */
export async function loginArca(c: CredencialesArca): Promise<TicketArca> {
  const forge = (await import("node-forge")).default;
  const ahora = Date.now();
  const tra =
    `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>` +
    `<uniqueId>${Math.floor(ahora / 1000)}</uniqueId>` +
    `<generationTime>${new Date(ahora - 600_000).toISOString()}</generationTime>` +
    `<expirationTime>${new Date(ahora + 600_000).toISOString()}</expirationTime>` +
    `</header><service>wsfe</service></loginTicketRequest>`;
  const cert = forge.pki.certificateFromPem(c.certificado);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(c.clave),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date(ahora) as unknown as string },
    ],
  });
  p7.sign();
  const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());

  const res = await fetch(entorno(c).wsaa, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
    signal: AbortSignal.timeout(ESPERA_MS),
    body:
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
      `<soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`,
  });
  const xml = await res.text();
  const ta = tag(xml, "loginCmsReturn");
  if (!ta) throw new Error(`ARCA rechazó el login: ${des(tag(xml, "faultstring") ?? xml.slice(0, 300))}`);
  const ticket = des(ta);
  return { token: tag(ticket, "token")!, sign: tag(ticket, "sign")!, vence: new Date(tag(ticket, "expirationTime")!) };
}

async function wsfe(c: CredencialesArca, t: TicketArca, metodo: string, cuerpo: string): Promise<string> {
  const res = await fetch(entorno(c).wsfe, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://ar.gov.afip.dif.FEV1/${metodo}"` },
    signal: AbortSignal.timeout(ESPERA_MS),
    body:
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body>` +
      `<ar:${metodo}><ar:Auth><ar:Token>${t.token}</ar:Token><ar:Sign>${t.sign}</ar:Sign><ar:Cuit>${c.cuit}</ar:Cuit></ar:Auth>` +
      `${cuerpo}</ar:${metodo}></soap:Body></soap:Envelope>`,
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`ARCA respondió ${res.status} en ${metodo}: ${des(tag(xml, "faultstring") ?? xml.slice(0, 300))}`);
  return xml;
}

const lista = (xml: string, nombre: string) =>
  todos(xml, nombre).map((e) => `${tag(e, "Code")}: ${des(tag(e, "Msg") ?? "")}`);

/** Tipos de comprobante de ARCA que usa un responsable inscripto. */
export const TIPO_CBTE = { FACTURA_A: 1, NOTA_CREDITO_A: 3, FACTURA_B: 6, NOTA_CREDITO_B: 8 } as const;

export async function ultimoComprobante(c: CredencialesArca, t: TicketArca, ptoVta: number, tipo: number): Promise<number> {
  const xml = await wsfe(c, t, "FECompUltimoAutorizado", `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`);
  const err = lista(xml, "Err");
  if (err.length) throw new Error(`ARCA: ${err.join(" · ")}`);
  return Number(tag(xml, "CbteNro"));
}

export type Comprobante = {
  ptoVta: number;
  tipo: number;
  /** 80 CUIT, 96 DNI, 99 consumidor final sin identificar (con docNro "0"). */
  docTipo: number;
  docNro: string;
  /** 1 responsable inscripto, 4 exento, 5 consumidor final, 6 monotributo. */
  condicionIvaReceptor: number;
  fecha: Date;
  /** Una línea por alícuota. Id de ARCA: 4 = 10,5%, 5 = 21%, 6 = 27%. */
  ivas: { id: number; base: number; importe: number }[];
  /** Para una nota de crédito: la factura que anula. */
  asociado?: { tipo: number; ptoVta: number; numero: number; fecha: Date };
};

export type ResultadoCae = { numero: number; cae: string; vence: string; observaciones: string[] };

const plata = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const fechaArca = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).replace(/-/g, "");

/** Pide el CAE del comprobante siguiente al último autorizado de ese punto de venta y tipo. */
export async function emitirComprobante(c: CredencialesArca, t: TicketArca, cb: Comprobante): Promise<ResultadoCae> {
  // ponytail: último + 1 sin lock; dos cajas emitiendo a la vez en el mismo punto de venta chocan y ARCA rechaza la segunda (hay que reintentar).
  const numero = (await ultimoComprobante(c, t, cb.ptoVta, cb.tipo)) + 1;
  const neto = cb.ivas.reduce((s, i) => s + i.base, 0);
  const iva = cb.ivas.reduce((s, i) => s + i.importe, 0);
  const alicuotas = cb.ivas
    .map((i) => `<ar:AlicIva><ar:Id>${i.id}</ar:Id><ar:BaseImp>${plata(i.base)}</ar:BaseImp><ar:Importe>${plata(i.importe)}</ar:Importe></ar:AlicIva>`)
    .join("");
  const xml = await wsfe(
    c,
    t,
    "FECAESolicitar",
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${cb.ptoVta}</ar:PtoVta><ar:CbteTipo>${cb.tipo}</ar:CbteTipo></ar:FeCabReq>` +
      `<ar:FeDetReq><ar:FECAEDetRequest><ar:Concepto>1</ar:Concepto><ar:DocTipo>${cb.docTipo}</ar:DocTipo><ar:DocNro>${cb.docNro}</ar:DocNro>` +
      `<ar:CbteDesde>${numero}</ar:CbteDesde><ar:CbteHasta>${numero}</ar:CbteHasta><ar:CbteFch>${fechaArca(cb.fecha)}</ar:CbteFch>` +
      `<ar:ImpTotal>${plata(neto + iva)}</ar:ImpTotal><ar:ImpTotConc>0</ar:ImpTotConc><ar:ImpNeto>${plata(neto)}</ar:ImpNeto>` +
      `<ar:ImpOpEx>0</ar:ImpOpEx><ar:ImpTrib>0</ar:ImpTrib><ar:ImpIVA>${plata(iva)}</ar:ImpIVA>` +
      `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${cb.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
      (cb.asociado
        ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${cb.asociado.tipo}</ar:Tipo><ar:PtoVta>${cb.asociado.ptoVta}</ar:PtoVta>` +
          `<ar:Nro>${cb.asociado.numero}</ar:Nro><ar:Cuit>${c.cuit}</ar:Cuit><ar:CbteFch>${fechaArca(cb.asociado.fecha)}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
        : "") +
      `<ar:Iva>${alicuotas}</ar:Iva></ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`
  );
  const observaciones = lista(xml, "Obs");
  const cae = tag(xml, "CAE");
  if (tag(xml, "Resultado") !== "A" || !cae) {
    throw new Error(`ARCA rechazó el comprobante: ${[...lista(xml, "Err"), ...observaciones].join(" · ") || xml.slice(0, 300)}`);
  }
  return { numero, cae, vence: tag(xml, "CAEFchVto")!, observaciones };
}

/** CUIT con dígito verificador correcto (11 dígitos, guiones opcionales). */
export function cuitValido(cuit: string): boolean {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const resto = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(d[10]);
}

/** Lo que va en el QR del comprobante impreso (RG 4892). */
export function urlQrArca(q: {
  fecha: Date;
  cuit: string;
  ptoVta: number;
  tipo: number;
  numero: number;
  total: number;
  docTipo: number;
  docNro: string;
  cae: string;
}): string {
  const datos = {
    ver: 1,
    fecha: fechaArca(q.fecha).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    cuit: Number(q.cuit.replace(/\D/g, "")),
    ptoVta: q.ptoVta,
    tipoCmp: q.tipo,
    nroCmp: q.numero,
    importe: Number(plata(q.total)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: q.docTipo,
    nroDocRec: Number(q.docNro),
    tipoCodAut: "E",
    codAut: Number(q.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(datos)).toString("base64")}`;
}

/** Neto e IVA de un total con IVA incluido, a una sola alícuota. Suman exacto el total. */
export function desglosarIva(total: number, alicuota = 0.21) {
  const neto = Math.round((total / (1 + alicuota)) * 100) / 100;
  return { neto, iva: Math.round((total - neto) * 100) / 100 };
}
