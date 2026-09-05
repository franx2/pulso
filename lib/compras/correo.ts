/**
 * Los remitos llegan por mail: acá se los va a buscar.
 *
 * Es IMAP y no un webhook a propósito. Un webhook necesita un dominio propio
 * y un servicio de mail entrante configurado; hoy el proyecto todavía no
 * tiene dominio (ver §1 del handoff). Una casilla común y corriente a la que
 * el proveedor le manda —o a la que se reenvía— funciona desde el primer día
 * y no depende de nada más.
 *
 * Los mensajes procesados se marcan como leídos, que es lo que evita
 * procesarlos dos veces. Como red de seguridad, la carga igual rechaza
 * remitos repetidos por número: si alguien marca todo como no leído, no se
 * duplican los costos.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

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
};

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
  };
}

/** Tope de mensajes por corrida, para no pasarse del tiempo de la función. */
const MAX_MENSAJES = 25;

/**
 * Trae los PDF adjuntos de los mails sin leer y los marca como leídos.
 *
 * Sólo se marca lo que se pudo leer entero: si la conexión se corta a la
 * mitad, los mensajes que no se procesaron siguen sin leer y entran en la
 * corrida siguiente.
 */
export async function traerRemitosSinLeer(config: ConfigCorreo): Promise<AdjuntoPdf[]> {
  const cliente = new ImapFlow({
    host: config.host,
    port: config.puerto,
    secure: true,
    auth: { user: config.usuario, pass: config.password },
    logger: false,
  });

  const adjuntos: AdjuntoPdf[] = [];
  await cliente.connect();
  try {
    const cerrojo = await cliente.getMailboxLock(config.carpeta);
    try {
      const sinLeer = await cliente.search({ seen: false });
      const mensajes = (sinLeer || []).slice(-MAX_MENSAJES);

      for (const uid of mensajes) {
        const bajado = await cliente.download(String(uid), undefined, { uid: true });
        if (!bajado?.content) continue;
        const mail = await simpleParser(bajado.content);
        const pdfs = (mail.attachments ?? []).filter(
          (adjunto) =>
            adjunto.contentType === "application/pdf" ||
            (adjunto.filename ?? "").toLowerCase().endsWith(".pdf")
        );
        const remitente = mail.from?.text ?? "desconocido";
        for (const pdf of pdfs) {
          adjuntos.push({
            nombre: pdf.filename ?? "remito.pdf",
            contenido: new Uint8Array(pdf.content),
            origen: `${remitente} · ${mail.subject ?? "sin asunto"}`,
          });
        }
        // Se marca leído aunque no traiga PDF: si no, los mails sueltos del
        // proveedor se vuelven a bajar en cada corrida para siempre.
        await cliente.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      cerrojo.release();
    }
  } finally {
    await cliente.logout();
  }

  return adjuntos;
}
