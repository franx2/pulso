const MINUTOS_DIA = 24 * 60;

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Posición (en % del ancho) de un turno dentro de la ventana de apertura de un
 * día, para dibujarlo como barra horizontal.
 *
 * Todo se expresa en minutos relativos a la apertura. El wraparound de
 * medianoche sólo se aplica cuando corresponde: si la ventana del local cruza
 * medianoche (ej. boliche 20:00–02:00), un horario "chico" en reloj (ej.
 * 01:00) es en realidad tarde en la ventana; pero si el local NO cruza
 * medianoche, un turno que arranca antes de abrir es simplemente negativo
 * (se recorta contra el borde izquierdo), no "casi un día después". Tratar
 * ambos casos igual fue el primer bug de esta función.
 * Devuelve `null` si el turno no se solapa nada con la ventana.
 */
export function posicionBarra(
  abre: string,
  cierra: string,
  horaInicio: string,
  horaFin: string
): { leftPct: number; widthPct: number } | null {
  const abreMin = aMinutos(abre);
  const cierraMin = aMinutos(cierra);
  const ventanaCruzaMedianoche = cierraMin <= abreMin;
  let ventana = cierraMin - abreMin;
  if (ventanaCruzaMedianoche) ventana += MINUTOS_DIA;

  const relativo = (hhmm: string) => {
    let rel = aMinutos(hhmm) - abreMin;
    if (ventanaCruzaMedianoche && rel < 0) rel += MINUTOS_DIA;
    return rel;
  };

  const inicioRel = relativo(horaInicio);
  let finRel = relativo(horaFin);
  if (finRel <= inicioRel) finRel += MINUTOS_DIA; // el turno en sí cruza medianoche

  if (inicioRel >= ventana) return null; // arrancó después del cierre

  const inicioClamp = Math.max(0, inicioRel);
  const finClamp = Math.min(ventana, finRel);
  if (finClamp <= inicioClamp) return null; // terminó antes de abrir

  return {
    leftPct: (inicioClamp / ventana) * 100,
    widthPct: ((finClamp - inicioClamp) / ventana) * 100,
  };
}
