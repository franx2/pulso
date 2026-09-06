/**
 * Los remitos llegan por mail: acá se los va a buscar.
 *
 * Es IMAP y no un webhook a propósito. Un webhook necesita un dominio propio
 * y un servicio de mail entrante configurado; hoy el proyecto todavía no
 * tiene dominio (ver §1 del handoff). Una casilla común y corriente a la que
 * el proveedor le manda —o a la que se reenvía— funciona desde el primer día
 * y no depende de nada más.
 *
 * **No borra, no archiva, no mueve y no marca como leído.** Los mensajes
 * procesados se marcan con una etiqueta propia (`Pulso/Procesado` en Gmail),
 * que es lo único que este código escribe en la casilla. La casilla es la
 * personal del dueño: tocarle el estado de leído le haría perder de vista
 * mails que todavía no miró.
 *
 * Como red de seguridad, la carga igual rechaza remitos repetidos por número,
 * así que aunque la etiqueta falle o alguien la borre, no se duplican los
 * costos: se vuelve a leer el PDF y se descarta.
 */

import { unzipSync } from "fflate";
import { createExtractorFromData } from "node-unrar-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type Diagnostico = {
  /** Mensajes que la búsqueda encontró en la ventana. */
  candidatos: number;
  /** Los que se miraron de verdad, después del tope por corrida. */
  procesados: number;
  /** Los que quedaron afuera por el tope: si esto no es cero, falta data. */
  omitidosPorTope: number;
  /**
   * Adjuntos de los que no salió ningún PDF, con su tipo.
   *
   * Existe porque no verlos ya costó caro dos veces: un adjunto que no se
   * entiende no tira error, desaparece. Con esto, una sola corrida dice qué
   * son los archivos que el lector no está abriendo.
   */
  adjuntosIgnorados: { nombre: string; tipo: string; bytes: number; motivo: string }[];
};

export type AdjuntoPdf = {
  nombre: string;
  contenido: Uint8Array;
  /** Remitente y asunto, para poder rastrear de dónde salió cada compra. */
  origen: string;
};

export type ConfigCorreo = {
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  /** Carpeta a mirar. Por defecto la bandeja de entrada. */
  carpeta: string;
  /**
   * Sólo se miran los mails de este remitente. Alcanza con el dominio.
   *
   * En una casilla personal es lo que evita que el cron ande abriendo y
   * etiquetando correspondencia que no tiene nada que ver.
   */
  remitente: string | null;
};

/** Riesgos de configuración que conviene que la respuesta del cron diga. */
export function advertencias(config: ConfigCorreo): string[] {
  if (config.carpeta.toUpperCase() === "INBOX" && !config.remitente) {
    return [
      "Está leyendo INBOX sin filtro de remitente: va a abrir y etiquetar todo " +
        "mail que entre. Poné REMITOS_REMITENTE con el mail del proveedor, o " +
        "mandá los remitos a una carpeta propia con REMITOS_IMAP_CARPETA.",
    ];
  }
  return [];
}

/**
 * Lee la configuración del entorno.
 *
 * Devuelve null en vez de tirar error si falta algo: el cron tiene que poder
 * responder "no configurado" con claridad en lugar de romperse con un stack.
 * La contraseña es de aplicación (Gmail exige 2FA y una app password), nunca
 * la del usuario, y vive sólo en variables de entorno — el repo es público.
 */
export function configDesdeEntorno(): ConfigCorreo | null {
  const host = process.env.REMITOS_IMAP_HOST;
  const usuario = process.env.REMITOS_IMAP_USER;
  const password = process.env.REMITOS_IMAP_PASSWORD;
  if (!host || !usuario || !password) return null;
  return {
    host,
    puerto: Number(process.env.REMITOS_IMAP_PORT) || 993,
    usuario,
    password,
    carpeta: process.env.REMITOS_IMAP_CARPETA || "INBOX",
    remitente: process.env.REMITOS_REMITENTE || null,
  };
}

/**
 * Tope de mensajes por corrida, para no pasarse del tiempo de la función.
 *
 * No es un límite del histórico: los procesados quedan etiquetados, así que
 * corridas sucesivas van tomando los siguientes y avanzan hacia atrás solas.
 * `omitidosPorTope` dice cuántos quedaron para la próxima.
 */
const MAX_MENSAJES = 25;

/**
 * La marca que distingue lo ya procesado. Gmail muestra los keywords de IMAP
 * como etiquetas, así que en la casilla se ve como "Pulso/Procesado" y no
 * cambia nada más del mensaje.
 */
const MARCA = "PulsoProcesado";

/**
 * Ventana hacia atrás por defecto. Sin esto la búsqueda recorrería la casilla
 * entera en cada corrida, que para el uso diario es puro trabajo de más.
 * Se puede ampliar por parámetro para cargar historia vieja.
 */
const DIAS_ATRAS = 45;

/**
 * Busca los mensajes candidatos, tolerando cómo busca Gmail.
 *
 * `FROM` en Gmail no es la coincidencia parcial que manda el estándar: pasa
 * por su propio buscador, que tokeniza, y un patrón como `@dominio.com` puede
 * no devolver nada aunque los mails estén ahí. Así que si el filtro de
 * remitente no encuentra nada se reintenta sin él —acotado por fecha— y el
 * remitente se verifica después, sobre el mensaje ya bajado.
 */
async function buscar(
  cliente: ImapFlow,
  desde: Date,
  remitente: string | null
): Promise<number[]> {
  if (remitente) {
    // Sin el "@" inicial: Gmail lo trata como separador y con él suele no
    // devolver nada.
    const patron = remitente.replace(/^@/, "");
    const conFiltro = await cliente.search({ since: desde, from: patron }, { uid: true });
    if (conFiltro && conFiltro.length > 0) return conFiltro;
  }
  const todos = await cliente.search({ since: desde }, { uid: true });
  return todos || [];
}

const esPdf = (nombre: string, tipo: string) =>
  tipo === "application/pdf" || nombre.toLowerCase().endsWith(".pdf");

const esZip = (nombre: string, tipo: string) =>
  /zip/i.test(tipo) || nombre.toLowerCase().endsWith(".zip");

const esRar = (nombre: string, tipo: string) =>
  /rar/i.test(tipo) || nombre.toLowerCase().endsWith(".rar");

/**
 * Los PDF de un RAR.
 *
 * El proveedor comprime en RAR, no en ZIP: se descubrió porque el cron empezó
 * a reportar los adjuntos que no sabía abrir, y ahí aparecieron
 * "PRESUPUESTO CUMBRES 3ER SEMANA AGOSTO.rar" y dos más. RAR es formato
 * propietario y no hay nada en la librería estándar, así que va con
 * `node-unrar-js`, que es la fuente oficial de descompresión compilada a
 * WebAssembly — sirve en Vercel, donde no se puede instalar un binario.
 */
async function pdfsDeRar(nombre: string, contenido: Buffer): Promise<{ nombre: string; datos: Uint8Array }[]> {
  const salida: { nombre: string; datos: Uint8Array }[] = [];
  const extractor = await createExtractorFromData({
    data: Uint8Array.from(contenido).buffer as ArrayBuffer,
  });
  // `files` es un generador: la descompresión ocurre al recorrerlo, no al
  // llamar a `extract()`.
  const extraidos = extractor.extract();
  for (const archivo of extraidos.files) {
    const interno = archivo.fileHeader.name;
    if (archivo.fileHeader.flags.directory || !interno.toLowerCase().endsWith(".pdf")) continue;
    if (!archivo.extraction) continue;
    salida.push({ nombre: `${nombre} → ${interno.split(/[\\/]/).pop()}`, datos: archivo.extraction });
  }
  return salida;
}

/**
 * Los PDF de un adjunto, abriendo el ZIP si viene comprimido.
 *
 * Hace falta porque el proveedor no es consistente: algunas semanas manda los
 * remitos sueltos y otras los manda en un ZIP junto al estado de cuenta. Sin
 * esto, esas semanas simplemente no existían — se perdieron nueve días de
 * compras de agosto sin que nada avisara, porque un adjunto que no es PDF no
 * genera error, genera silencio.
 */
async function pdfsDelAdjunto(
  nombre: string,
  tipo: string,
  contenido: Buffer
): Promise<{ pdfs: { nombre: string; datos: Uint8Array }[]; motivo: string }> {
  if (esPdf(nombre, tipo)) return { pdfs: [{ nombre, datos: new Uint8Array(contenido) }], motivo: "" };
  try {
    if (esRar(nombre, tipo)) {
      const pdfs = await pdfsDeRar(nombre, contenido);
      return { pdfs, motivo: pdfs.length === 0 ? "RAR sin PDF adentro" : "" };
    }
    if (!esZip(nombre, tipo)) return { pdfs: [], motivo: "formato que no sé abrir" };
    const archivos = unzipSync(new Uint8Array(contenido));
    const pdfs = Object.entries(archivos)
      .filter(([interno]) => interno.toLowerCase().endsWith(".pdf"))
      .map(([interno, datos]) => ({ nombre: `${nombre} → ${interno.split("/").pop()}`, datos }));
    return { pdfs, motivo: pdfs.length === 0 ? "ZIP sin PDF adentro" : "" };
  } catch (error) {
    // Un comprimido roto, con contraseña, o una librería que no cargó no puede
    // tumbar el resto del mail. Pero el motivo se reporta: "no lo pude abrir"
    // y "no sé qué es" se arreglan de maneras distintas.
    return { pdfs: [], motivo: error instanceof Error ? error.message : "error al descomprimir" };
  }
}

/** Si el mensaje es del proveedor, mirando el encabezado ya parseado. */
function esDelProveedor(remitenteMail: string, filtro: string | null): boolean {
  if (!filtro) return true;
  return remitenteMail.toLowerCase().includes(filtro.replace(/^@/, "").toLowerCase());
}

/**
 * Trae los PDF adjuntos de los mails del proveedor que todavía no se leyeron.
 *
 * Sólo se marca lo que se procesó entero: si la conexión se corta a la mitad,
 * los mensajes que faltaron entran en la corrida siguiente.
 */
export async function traerRemitosSinLeer(
  config: ConfigCorreo,
  opciones: { reprocesar?: boolean; diasAtras?: number } = {}
): Promise<{ adjuntos: AdjuntoPdf[]; diagnostico: Diagnostico }> {
  const cliente = new ImapFlow({
    host: config.host,
    port: config.puerto,
    secure: true,
    auth: { user: config.usuario, pass: config.password },
    logger: false,
  });

  const adjuntos: AdjuntoPdf[] = [];
  const diagnostico: Diagnostico = { candidatos: 0, procesados: 0, omitidosPorTope: 0, adjuntosIgnorados: [] };
  await cliente.connect();
  try {
    const cerrojo = await cliente.getMailboxLock(config.carpeta);
    try {
      const desde = new Date(Date.now() - (opciones.diasAtras ?? DIAS_ATRAS) * 86400000);
      const candidatos = await buscar(cliente, desde, config.remitente);

      // El keyword se filtra ACÁ y no en la búsqueda. Gmail no implementa
      // `UNKEYWORD` sobre keywords propios como manda el estándar: en vez de
      // devolver "todos los que no la tienen" devuelve vacío, y el cron leía
      // cero mensajes teniendo la casilla llena. Traer los flags de unas
      // pocas decenas de mensajes es barato y no depende de esa rareza.
      const mensajes: number[] = [];
      for await (const mensaje of cliente.fetch(
        { uid: `${candidatos.join(",")}` },
        { uid: true, flags: true },
        { uid: true }
      )) {
        if (opciones.reprocesar || !mensaje.flags?.has(MARCA)) mensajes.push(mensaje.uid);
      }
      diagnostico.candidatos = mensajes.length;
      // Se quedan los MÁS NUEVOS. Si el tope recorta, lo que se pierde es lo
      // viejo, y hay que poder verlo: un hueco silencioso en el histórico de
      // compras es exactamente el error que este contador evita.
      diagnostico.omitidosPorTope = Math.max(0, mensajes.length - MAX_MENSAJES);
      mensajes.splice(0, diagnostico.omitidosPorTope);
      diagnostico.procesados = mensajes.length;

      for (const uid of mensajes) {
        const bajado = await cliente.download(String(uid), undefined, { uid: true });
        if (!bajado?.content) continue;
        const mail = await simpleParser(bajado.content);
        const remitente = mail.from?.text ?? "desconocido";
        // La verificación real del remitente pasa acá, sobre el encabezado ya
        // parseado, porque la búsqueda del servidor puede haber traído de más.
        if (!esDelProveedor(remitente, config.remitente)) continue;
        for (const adjunto of mail.attachments ?? []) {
          const nombre = adjunto.filename ?? "adjunto";
          const tipo = adjunto.contentType ?? "";
          const { pdfs, motivo } = await pdfsDelAdjunto(nombre, tipo, adjunto.content);
          if (pdfs.length === 0) {
            diagnostico.adjuntosIgnorados.push({ nombre, tipo, bytes: adjunto.content?.length ?? 0, motivo });
          }
          for (const pdf of pdfs) {
            adjuntos.push({
              nombre: pdf.nombre,
              contenido: pdf.datos,
              origen: `${remitente} · ${mail.subject ?? "sin asunto"}`,
            });
          }
        }
        // Se marca aunque no traiga PDF: si no, los mails sueltos del
        // proveedor se vuelven a bajar en cada corrida para siempre. No se
        // toca `\Seen`: el mail queda como estaba para el dueño.
        await cliente.messageFlagsAdd(String(uid), [MARCA], { uid: true }).catch(() => {
          // Que no se pueda etiquetar no es motivo para perder el remito: se
          // vuelve a leer la próxima vez y la carga lo descarta por repetido.
        });
      }
    } finally {
      cerrojo.release();
    }
  } finally {
    await cliente.logout();
  }

  return { adjuntos, diagnostico };
}
