import { NextResponse } from "next/server";
import { advertencias, configDesdeEntorno, traerRemitosSinLeer } from "@/lib/compras/correo";
import { ingerirRemito } from "@/lib/compras/ingesta";

/** Bajar mails y leer PDF es I/O; 25 remitos entran holgados. */
export const maxDuration = 300;

/**
 * Busca remitos nuevos en la casilla y los carga.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/remitos
 *
 * Conviene correrlo cada una o dos horas: los remitos no son urgentes, y
 * llegan de a uno o dos por día.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron no configurado" }, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const config = configDesdeEntorno();
  if (!config) {
    return NextResponse.json(
      { error: "Falta configurar la casilla: REMITOS_IMAP_HOST, REMITOS_IMAP_USER y REMITOS_IMAP_PASSWORD" },
      { status: 503 }
    );
  }

  // `?reprocesar=1` vuelve a mirar mails ya etiquetados. Sirve cuando el
  // lector mejora —abrir ZIP, por ejemplo— y hay que releer lo viejo. No
  // duplica nada: la carga descarta los remitos ya cargados por número.
  const reprocesar = new URL(request.url).searchParams.get("reprocesar") === "1";

  let adjuntos;
  try {
    adjuntos = await traerRemitosSinLeer(config, { reprocesar });
  } catch (error) {
    // Que falle el correo no es lo mismo que no haber remitos: se distingue,
    // o un problema de credenciales pasaría meses sin que nadie lo note.
    return NextResponse.json(
      { error: `No pude leer la casilla: ${error instanceof Error ? error.message : "error"}` },
      { status: 502 }
    );
  }

  const resultados = [];
  for (const adjunto of adjuntos) {
    try {
      resultados.push({ archivo: adjunto.nombre, ...(await ingerirRemito(adjunto.contenido, { origen: adjunto.origen })) });
    } catch (error) {
      // Un PDF roto no puede dejar sin cargar a los que vienen atrás.
      resultados.push({
        archivo: adjunto.nombre,
        numero: "?",
        estado: "ilegible" as const,
        local: null,
        fecha: null,
        total: null,
        tipo: null,
        problemas: [error instanceof Error ? error.message : "error"],
      });
    }
  }

  return NextResponse.json({
    carpeta: config.carpeta,
    reprocesar,
    remitente: config.remitente ?? "(sin filtro)",
    advertencias: advertencias(config),
    revisados: adjuntos.length,
    guardados: resultados.filter((r) => r.estado === "guardado").length,
    duplicados: resultados.filter((r) => r.estado === "duplicado").length,
    ilegibles: resultados.filter((r) => r.estado === "ilegible").length,
    // Los estados de cuenta que vienen en el mismo mail: no son un problema.
    noSonRemitos: resultados.filter((r) => r.estado === "no_es_remito").length,
    sinLocal: resultados.filter((r) => r.estado === "guardado" && !r.local).length,
    resultados,
  });
}
