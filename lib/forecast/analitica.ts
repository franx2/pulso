export type MuestraHistorica = {
  fecha: string;
  ventas: number;
  tickets: number;
  personas?: number;
  tempMax?: number | null;
  lluviaMm?: number | null;
};

export type CorrelacionHistorica = {
  id: "tickets" | "ticketPromedio" | "temperatura" | "lluvia" | "personas";
  etiqueta: string;
  r: number | null;
  n: number;
  detalle: string;
};

type Par = { x: number; y: number };

export function correlacionPearson(pares: Par[]): number | null {
  const validos = pares.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (validos.length < 3) return null;

  const mediaX = validos.reduce((s, p) => s + p.x, 0) / validos.length;
  const mediaY = validos.reduce((s, p) => s + p.y, 0) / validos.length;
  let numerador = 0;
  let sumaX = 0;
  let sumaY = 0;

  for (const p of validos) {
    const dx = p.x - mediaX;
    const dy = p.y - mediaY;
    numerador += dx * dy;
    sumaX += dx * dx;
    sumaY += dy * dy;
  }

  const denominador = Math.sqrt(sumaX * sumaY);
  if (denominador === 0) return null;
  return Math.max(-1, Math.min(1, numerador / denominador));
}

function correlacion(
  id: CorrelacionHistorica["id"],
  etiqueta: string,
  pares: Par[],
  detalle: string
): CorrelacionHistorica {
  return { id, etiqueta, r: correlacionPearson(pares), n: pares.length, detalle };
}

/**
 * Relaciones descriptivas sobre días observados. Para clima se normalizan las
 * ventas contra el promedio del mismo día de semana, evitando leer un sábado
 * fuerte como si lo hubiera causado la temperatura o la lluvia.
 */
export function correlacionesHistoricas(muestras: MuestraHistorica[]): CorrelacionHistorica[] {
  const validas = muestras.filter((m) => m.ventas > 0 && m.tickets > 0);
  const ventasPorDia = new Map<number, number[]>();

  for (const m of validas) {
    const dia = new Date(`${m.fecha}T12:00:00Z`).getUTCDay();
    const grupo = ventasPorDia.get(dia) ?? [];
    grupo.push(m.ventas);
    ventasPorDia.set(dia, grupo);
  }

  const promedioPorDia = new Map(
    [...ventasPorDia].map(([dia, valores]) => [dia, valores.reduce((s, v) => s + v, 0) / valores.length])
  );

  const normalizadas = validas.map((m) => {
    const dia = new Date(`${m.fecha}T12:00:00Z`).getUTCDay();
    const base = promedioPorDia.get(dia) ?? m.ventas;
    return { ...m, ventasNormalizadas: base > 0 ? m.ventas / base : 1 };
  });

  const salida: CorrelacionHistorica[] = [
    correlacion(
      "tickets",
      "Tickets y facturación",
      validas.map((m) => ({ x: m.tickets, y: m.ventas })),
      "Cuánto acompaña la facturación al volumen de operaciones."
    ),
    correlacion(
      "ticketPromedio",
      "Ticket promedio y facturación",
      validas.map((m) => ({ x: m.ventas / m.tickets, y: m.ventas })),
      "Si el crecimiento viene del valor por compra, además del volumen."
    ),
  ];

  const temperatura = normalizadas
    .filter((m) => m.tempMax != null)
    .map((m) => ({ x: m.tempMax as number, y: m.ventasNormalizadas }));
  salida.push(
    correlacion(
      "temperatura",
      "Temperatura y ventas",
      temperatura,
      "Ventas ajustadas por día de semana para aislar mejor la señal climática."
    )
  );

  const lluvia = normalizadas
    .filter((m) => m.lluviaMm != null)
    .map((m) => ({ x: (m.lluviaMm ?? 0) >= 1 ? 1 : 0, y: m.ventasNormalizadas }));
  salida.push(
    correlacion(
      "lluvia",
      "Lluvia y ventas",
      lluvia,
      "Compara días con al menos 1 mm contra días secos, ajustado por día de semana."
    )
  );

  const personas = validas
    .filter((m) => (m.personas ?? 0) > 0)
    .map((m) => ({ x: m.personas as number, y: m.ventas }));
  if (personas.length >= 12) {
    salida.push(
      correlacion(
        "personas",
        "Comensales declarados y facturación",
        personas,
        "Sólo salón: delivery y take away no informan comensales en Fudo."
      )
    );
  }

  return salida;
}

export type SlotConFactores = {
  demandaBase: number;
  tickets: number;
  kManual: number;
  kDetalle: Record<string, number>;
};

export function resumirFactores(slots: SlotConFactores[]) {
  const baseTickets = slots.reduce((s, slot) => s + slot.demandaBase, 0);
  const finalTickets = slots.reduce((s, slot) => s + slot.tickets, 0);
  const promedio = (selector: (slot: SlotConFactores) => number) => {
    if (baseTickets <= 0) return 1;
    return slots.reduce((s, slot) => s + slot.demandaBase * selector(slot), 0) / baseTickets;
  };

  return {
    baseTickets,
    finalTickets,
    factorFinal: baseTickets > 0 ? finalTickets / baseTickets : 1,
    tendencia: promedio((slot) => slot.kDetalle.K_trend ?? 1),
    clima: promedio((slot) => slot.kDetalle.K_weather ?? 1),
    calendario: promedio((slot) => slot.kDetalle.K_calendar ?? 1),
    manual: promedio((slot) => slot.kManual),
  };
}
