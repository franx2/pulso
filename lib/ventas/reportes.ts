import { totalesDeVenta, type ItemCalculo } from "./calculos";
import { claveDiaAR, OFFSET_AR_MS } from "@/lib/fechaAR";

/**
 * Los números de la pestaña Reportes de Ventas, como en Fudo: indicadores con
 * su variación, evolución por día, por día de la semana y por hora, medios de
 * pago, origen, ranking de mozos y cancelaciones. Puro: entra la lista de
 * ventas cerradas y sale el reporte.
 */

export type VentaReporte = {
  tipo: "MESA" | "MOSTRADOR" | "DELIVERY";
  abiertaEn: Date;
  descuentoPct: number | null;
  descuentoMonto: number;
  mozo: string | null;
  abiertaPor: string;
  items: (ItemCalculo & { nombre: string; motivoAnulacion: string | null; anuladoPor: string | null })[];
  pagos: { medio: string; monto: number; propina: number; anulado: boolean }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const variacion = (actual: number, anterior: number) => (anterior > 0 ? ((actual - anterior) / anterior) * 100 : null);
const ORIGEN: Record<VentaReporte["tipo"], string> = { MOSTRADOR: "Mostrador", MESA: "Mesas", DELIVERY: "Delivery" };
export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function indicadores(ventas: VentaReporte[]) {
  let brutas = 0;
  let netas = 0;
  for (const v of ventas) {
    const t = totalesDeVenta(v.items, { pct: v.descuentoPct, monto: v.descuentoMonto });
    brutas += t.bruto;
    netas += t.total;
  }
  return { brutas: r2(brutas), netas: r2(netas), descuentos: r2(brutas - netas), cantidad: ventas.length, promedio: ventas.length ? r2(netas / ventas.length) : 0 };
}

/** Lista {nombre, valor, pct} ordenada de mayor a menor. */
function repartir(m: Map<string, number>) {
  const total = [...m.values()].reduce((s, x) => s + x, 0);
  return [...m]
    .map(([nombre, valor]) => ({ nombre, valor: r2(valor), pct: total > 0 ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function armarReporte(ventas: VentaReporte[], anteriores: VentaReporte[], dias: string[]) {
  const actual = indicadores(ventas);
  const previo = indicadores(anteriores);

  const porDia = new Map(dias.map((d) => [d, { dia: d, ventas: 0, cantidad: 0 }]));
  const porDiaSemana = DIAS_SEMANA.map((nombre) => ({ nombre, ventas: 0, cantidad: 0 }));
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, ventas: 0, cantidad: 0 }));
  const medios = new Map<string, number>();
  const origen = new Map<string, number>();
  const mozos = new Map<string, { usuario: string; productos: number; ventas: number }>();
  const cancelados = new Map<string, { producto: string; usuario: string; cantidad: number; monto: number }>();
  const motivos = new Map<string, number>();

  for (const v of ventas) {
    const total = totalesDeVenta(v.items, { pct: v.descuentoPct, monto: v.descuentoMonto }).total;
    // La hora y el día argentinos de cuando se abrió la venta.
    const local = new Date(v.abiertaEn.getTime() - OFFSET_AR_MS);
    const d = porDia.get(claveDiaAR(v.abiertaEn));
    if (d) {
      d.ventas += total;
      d.cantidad++;
    }
    const ds = porDiaSemana[(local.getUTCDay() + 6) % 7];
    ds.ventas += total;
    ds.cantidad++;
    const h = porHora[local.getUTCHours()];
    h.ventas += total;
    h.cantidad++;
    origen.set(ORIGEN[v.tipo], (origen.get(ORIGEN[v.tipo]) ?? 0) + total);
    for (const p of v.pagos) if (!p.anulado) medios.set(p.medio, (medios.get(p.medio) ?? 0) + p.monto);

    const quien = v.mozo ?? v.abiertaPor;
    const m = mozos.get(quien) ?? { usuario: quien, productos: 0, ventas: 0 };
    m.productos += v.items.filter((i) => !i.anulado).reduce((s, i) => s + i.cantidad, 0);
    m.ventas += total;
    mozos.set(quien, m);

    for (const i of v.items.filter((x) => x.anulado)) {
      const usuario = i.anuladoPor ?? "—";
      const clave = `${i.nombre}|${usuario}`;
      const c = cancelados.get(clave) ?? { producto: i.nombre, usuario, cantidad: 0, monto: 0 };
      c.cantidad += i.cantidad;
      c.monto += i.precio * i.cantidad;
      cancelados.set(clave, c);
      const motivo = i.motivoAnulacion ?? "OTRO";
      motivos.set(motivo, (motivos.get(motivo) ?? 0) + i.precio * i.cantidad);
    }
  }

  return {
    indicadores: {
      brutas: { valor: actual.brutas, variacion: variacion(actual.brutas, previo.brutas) },
      netas: { valor: actual.netas, variacion: variacion(actual.netas, previo.netas) },
      descuentos: { valor: actual.descuentos, variacion: variacion(actual.descuentos, previo.descuentos) },
      cantidad: { valor: actual.cantidad, variacion: variacion(actual.cantidad, previo.cantidad) },
      promedio: { valor: actual.promedio, variacion: variacion(actual.promedio, previo.promedio) },
    },
    evolucion: [...porDia.values()].map((d) => ({ ...d, ventas: r2(d.ventas) })),
    porDiaSemana: porDiaSemana.map((d) => ({ ...d, ventas: r2(d.ventas) })),
    porHora: porHora.map((h) => ({ ...h, ventas: r2(h.ventas) })),
    medios: repartir(medios),
    origen: repartir(origen),
    mozos: [...mozos.values()].map((m) => ({ ...m, ventas: r2(m.ventas) })).sort((a, b) => b.ventas - a.ventas),
    cancelaciones: [...cancelados.values()].map((c) => ({ ...c, monto: r2(c.monto) })).sort((a, b) => b.monto - a.monto),
    motivos: repartir(motivos),
  };
}

export type Reporte = ReturnType<typeof armarReporte>;
