/**
 * Qué movimientos del extracto bancario conviene mirar.
 *
 * No es un detector de fraude: es la lista corta que una persona que mira el
 * extracto con atención armaría sola —"la comisión subió", "esto no lo
 * pagábamos", "esto salió dos veces"— para que no haga falta leer los dos mil
 * renglones de un trimestre. Cada aviso dice por qué está y contra qué se
 * comparó, así se puede descartar de un vistazo.
 *
 * Los impuestos proporcionales (débitos y créditos, IVA de comisiones,
 * percepciones) quedan afuera: suben y bajan con el movimiento de la cuenta y
 * marcarlos sería ruido. La comisión de mantenimiento sí entra: es fija, y que
 * suba es justo lo que hay que ver.
 */

export type MovimientoParaRevisar = {
  id: string;
  fecha: string; // "AAAA-MM-DD"
  descripcion: string;
  referencia: string | null;
  debito: number;
  credito: number;
};

export type TipoAviso = "subio" | "nuevo" | "duplicado" | "fuera_de_lo_habitual" | "devolucion" | "inversion";

export type Aviso = {
  tipo: TipoAviso;
  /** "revisar": puede ser plata que no tendría que salir. "info": para saber. */
  gravedad: "revisar" | "info";
  fecha: string;
  /** A quién o por qué: el destinatario o el concepto. */
  quien: string;
  monto: number;
  titulo: string;
  detalle: string;
  ids: string[];
};

/** Días de historia previa mínimos para decir "esto es nuevo" sin mentir: un
 * cargo mensual tiene que haber tenido al menos un mes para aparecer. */
export const DIAS_HISTORIA_MINIMA = 35;

const PROPORCIONALES = /LEY 25413|^IVA\b|PERCEP|RETENC|SIRCREB|IIBB|ING\.? ?BRUTOS/i;
const RECURRENTES = /PAGO DE SERVICIOS|DEB\.? ?AUTOM|DEBITO AUTOMATICO|COMISION|SEGURO|MANTENIMIENTO|ABONO|CUOTA/i;
const INVERSION = /SUSCRIPCI[OÓ]N (FIMA|FCI)|PLAZO FIJO|FONDO COMUN/i;
const DEVOLUCION = /DEVOLUCI[OÓ]N/i;
const PROPIAS = /CTAS? PROPIAS/i;
/** Lo que no es un destinatario: un período, un número de operación, un código. */
const NO_ES_QUIEN = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b|^operaci|^grupo de acredit|^\d|^varios$/i;

const normal = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** El destinatario de un movimiento, si la referencia lo dice. */
export function quienDe(m: Pick<MovimientoParaRevisar, "descripcion" | "referencia">): string | null {
  const primera = m.referencia?.split(" · ")[0]?.trim();
  if (!primera || NO_ES_QUIEN.test(primera)) return null;
  return primera;
}

/** Misma clave para "Bianco y Nero S.R.L.." y "BIANCO Y NERO SRL". */
function clave(m: MovimientoParaRevisar): string {
  return `${normal(m.descripcion)}|${normal(quienDe(m) ?? "")}`;
}

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const mitad = Math.floor(o.length / 2);
  return o.length % 2 ? o[mitad] : (o[mitad - 1] + o[mitad]) / 2;
};

const restarDias = (dia: string, n: number) => {
  const f = new Date(`${dia}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() - n);
  return f.toISOString().slice(0, 10);
};

const plata = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export function movimientosRaros(
  movimientos: MovimientoParaRevisar[],
  desde: string,
  hasta: string
): { avisos: Aviso[]; historiaSuficiente: boolean } {
  const todos = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const delPeriodo = todos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const primera = todos[0]?.fecha;
  const historiaSuficiente = Boolean(primera && primera <= restarDias(desde, DIAS_HISTORIA_MINIMA));
  const avisos: Aviso[] = [];
  const nombre = (m: MovimientoParaRevisar) => quienDe(m) ?? m.descripcion;

  // Lo que se compara: débitos que no son impuestos proporcionales ni
  // movimientos entre cuentas propias.
  const comparables = todos.filter(
    (m) => m.debito > 0 && !PROPORCIONALES.test(m.descripcion) && !PROPIAS.test(m.descripcion)
  );
  const porClave = new Map<string, MovimientoParaRevisar[]>();
  for (const m of comparables) porClave.set(clave(m), [...(porClave.get(clave(m)) ?? []), m]);

  for (const m of delPeriodo) {
    if (m.debito <= 0) continue;
    if (INVERSION.test(m.descripcion)) {
      avisos.push({
        tipo: "inversion",
        gravedad: "info",
        fecha: m.fecha,
        quien: nombre(m),
        monto: m.debito,
        titulo: "Pasó a una inversión",
        detalle: "No es un gasto: la plata sigue siendo tuya, invertida en un fondo o plazo fijo del banco.",
        ids: [m.id],
      });
      continue;
    }
    if (DEVOLUCION.test(m.descripcion)) {
      avisos.push({
        tipo: "devolucion",
        gravedad: "info",
        fecha: m.fecha,
        quien: nombre(m),
        monto: m.debito,
        titulo: "Devolución de una venta",
        detalle: "Se le devolvió plata a un cliente. Si no hubo un reclamo, conviene ver qué venta fue.",
        ids: [m.id],
      });
      continue;
    }
    if (PROPORCIONALES.test(m.descripcion) || PROPIAS.test(m.descripcion)) continue;

    const iguales = porClave.get(clave(m)) ?? [];
    const anteriores = iguales.filter((x) => x.fecha < m.fecha || (x.fecha === m.fecha && x.id < m.id));

    // Primera vez: nunca antes un débito a este destinatario o por este concepto.
    if (historiaSuficiente && anteriores.length === 0) {
      const automatico = /DEB\.? ?AUTOM|DEBITO AUTOMATICO/i.test(m.descripcion);
      avisos.push({
        tipo: "nuevo",
        gravedad: automatico || m.debito >= 50_000 ? "revisar" : "info",
        fecha: m.fecha,
        quien: nombre(m),
        monto: m.debito,
        titulo: automatico ? "Débito automático nuevo" : "Primera vez que sale plata a este destino",
        detalle: automatico
          ? "Un débito automático que no aparecía antes: puede ser una suscripción o un servicio nuevo."
          : `No había ningún pago a ${nombre(m)} en el extracto anterior.`,
        ids: [m.id],
      });
    }

    // Duplicado: mismo destino y mismo importe en menos de cuatro días.
    const gemelo = anteriores.find(
      (x) => Math.round(x.debito * 100) === Math.round(m.debito * 100) && x.fecha >= restarDias(m.fecha, 3)
    );
    if (gemelo) {
      avisos.push({
        tipo: "duplicado",
        gravedad: "revisar",
        fecha: m.fecha,
        quien: nombre(m),
        monto: m.debito,
        titulo: "Posible cobro duplicado",
        detalle: `El mismo importe a ${nombre(m)} ya había salido el ${gemelo.fecha.split("-").reverse().join("/")}.`,
        ids: [gemelo.id, m.id],
      });
    }

    // Fuera de lo habitual: más del doble de lo que suele salir a ese destino.
    // Los cargos fijos se miran por mes, abajo: la luz llega en dos facturas
    // (dos medidores) y una contra el promedio de las dos daba falsa alarma.
    if (!RECURRENTES.test(m.descripcion) && anteriores.length >= 4 && m.debito >= 20_000) {
      const habitual = mediana(anteriores.map((x) => x.debito));
      if (m.debito > habitual * 2) {
        avisos.push({
          tipo: "fuera_de_lo_habitual",
          gravedad: "revisar",
          fecha: m.fecha,
          quien: nombre(m),
          monto: m.debito,
          titulo: "Mucho más que lo habitual",
          detalle: `Suele salir alrededor de ${plata(habitual)} a ${nombre(m)}; esta vez fue ${(m.debito / habitual).toFixed(1).replace(".", ",")} veces eso.`,
          ids: [m.id],
        });
      }
    }
  }

  // Subió un cargo fijo: el total del mes contra los meses anteriores. Por mes
  // y no por movimiento porque la luz llega en dos facturas (dos medidores).
  for (const [, lista] of porClave) {
    if (!RECURRENTES.test(lista[0].descripcion)) continue;
    const porMes = new Map<string, MovimientoParaRevisar[]>();
    for (const m of lista) porMes.set(m.fecha.slice(0, 7), [...(porMes.get(m.fecha.slice(0, 7)) ?? []), m]);
    const meses = [...porMes.keys()].sort();
    for (let i = 1; i < meses.length; i++) {
      const mes = meses[i];
      const movs = porMes.get(mes)!;
      if (!movs.some((m) => m.fecha >= desde && m.fecha <= hasta)) continue;
      const total = movs.reduce((s, m) => s + m.debito, 0);
      // Contra el mes anterior: un aumento se avisa una vez, el mes en que
      // pasa, y no todos los meses siguientes contra un promedio viejo.
      const antes = porMes.get(meses[i - 1])!.reduce((s, m) => s + m.debito, 0);
      if (total > antes * 1.1 && total - antes >= 5_000) {
        avisos.push({
          tipo: "subio",
          gravedad: "revisar",
          fecha: movs[movs.length - 1].fecha,
          quien: nombre(movs[0]),
          monto: total,
          titulo: `Subió ${Math.round((total / antes - 1) * 100)}%`,
          detalle: `${nombre(movs[0])}: ${plata(total)} en el mes, contra ${plata(antes)} el mes anterior.`,
          ids: movs.map((m) => m.id),
        });
      }
    }
  }

  const orden = { revisar: 0, info: 1 };
  avisos.sort((a, b) => orden[a.gravedad] - orden[b.gravedad] || b.monto - a.monto);
  return { avisos, historiaSuficiente };
}
