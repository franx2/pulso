/**
 * Convalidación de pagos a la fábrica: cada pago cargado a mano, contra el
 * extracto bancario.
 *
 * A diferencia de la conciliación de ventas (que es por período, porque son
 * cientos de cobros por día), acá sí tiene sentido emparejar uno por uno: un
 * pago a un proveedor lo carga una persona, son unos pocos por mes, y cada
 * uno tiene que poder señalar la transferencia exacta que lo respalda.
 *
 * Un pago sin banco detrás no es necesariamente un error —puede haber sido en
 * efectivo o cheque— pero si se cargó "Transferencia" y no aparece nada
 * parecido en el extracto, es la primera señal de que algo no cierra.
 */

export type PagoAConvalidar = {
  id: string;
  fecha: string;
  monto: number;
  medio: string | null;
};

export type MovimientoAConvalidar = {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  debito: number;
};

export type PagoConvalidado = {
  pago: PagoAConvalidar;
  movimiento: MovimientoAConvalidar | null;
  /** Positivo = el banco es posterior al pago cargado. `null` sin match. */
  diferenciaDias: number | null;
};

/** Ventana de días alrededor del pago donde se busca la transferencia. Un
 * pago cargado "hoy" puede haberse hecho un par de días antes, o el banco
 * puede acreditarlo con demora. */
const VENTANA_DIAS = 3;

/** Tolerancia del monto: una persona tipea $150.000 y el banco descontó
 * $149.980 de gastos, o redondeó. Mismo criterio que la tolerancia de los
 * remitos: un piso fijo más un porcentaje del monto. */
const TOLERANCIA_PESOS = 50;
const TOLERANCIA_PCT = 0.005;

function diasEntre(a: string, b: string): number {
  const msPorDia = 86_400_000;
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / msPorDia);
}

/**
 * Empareja cada pago con, a lo sumo, un movimiento bancario. Es voraz y por
 * cercanía de fecha: entre los candidatos dentro de tolerancia, gana el más
 * próximo al día del pago, y un movimiento usado no se le puede asignar a
 * otro pago — dos pagos del mismo monto no pueden señalar la misma
 * transferencia.
 */
export function convalidarPagos(
  pagos: PagoAConvalidar[],
  movimientos: MovimientoAConvalidar[]
): { pagos: PagoConvalidado[]; sinRegistrar: MovimientoAConvalidar[] } {
  const candidatos = movimientos.filter((m) => m.debito > 0);
  const usados = new Set<string>();

  const resultado: PagoConvalidado[] = [...pagos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((pago) => {
      const tolerancia = TOLERANCIA_PESOS + pago.monto * TOLERANCIA_PCT;
      let mejor: MovimientoAConvalidar | null = null;
      let mejorDistancia = Infinity;

      for (const m of candidatos) {
        if (usados.has(m.id)) continue;
        if (Math.abs(m.debito - pago.monto) > tolerancia) continue;
        const distancia = Math.abs(diasEntre(pago.fecha, m.fecha));
        if (distancia > VENTANA_DIAS) continue;
        if (distancia < mejorDistancia) {
          mejor = m;
          mejorDistancia = distancia;
        }
      }

      if (mejor) usados.add(mejor.id);
      return {
        pago,
        movimiento: mejor,
        diferenciaDias: mejor ? diasEntre(pago.fecha, mejor.fecha) : null,
      };
    });

  // Transferencias salientes que el banco etiqueta como pago a un proveedor
  // ("PROVEED" en la descripción, como imprime Galicia) y que ningún pago
  // cargado reclamó: puede ser un pago real que se olvidaron de cargar acá.
  const sinRegistrar = candidatos.filter((m) => !usados.has(m.id) && /PROVEED/i.test(m.descripcion));

  return { pagos: resultado, sinRegistrar };
}
