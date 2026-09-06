export const REGLAS_HELADO = [
  { id: "bocha-1", etiqueta: "1 bocha / cucurucho", gramos: 90 },
  { id: "bochas-2", etiqueta: "2 bochas / cucurucho", gramos: 180 },
  { id: "bochas-3", etiqueta: "3 bochas / cucuruchón", gramos: 270 },
  { id: "cuarto", etiqueta: "Pote de 1/4", gramos: 270 },
  { id: "medio", etiqueta: "Pote de 1/2", gramos: 550 },
  { id: "kilo", etiqueta: "Pote de 1 kg", gramos: 1070 },
] as const;

export type ReglaHelado = (typeof REGLAS_HELADO)[number];

export type CompraHelado = {
  detalle: string;
  cantidadKg: number;
  costo: number;
};

export type VentaHelado = {
  producto: string;
  cantidad: number;
};

export type ResumenHelado = {
  compradoKg: number;
  costoComprado: number;
  costoPorKg: number | null;
  vendidoKgEstimado: number;
  balanceKg: number | null;
  ratioVendidoCompradoPct: number | null;
  unidadesConRegla: number;
  unidadesSinRegla: number;
  coberturaPct: number | null;
  formatos: {
    id: ReglaHelado["id"];
    etiqueta: string;
    gramosPorUnidad: number;
    unidades: number;
    kilos: number;
  }[];
  sabores: { producto: string; kilos: number; costo: number }[];
  sinRegla: { producto: string; cantidad: number }[];
};

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const porId = new Map(REGLAS_HELADO.map((regla) => [regla.id, regla]));

/**
 * Convierte el nombre real de Fudo a una porcion de helado.
 *
 * Las coincidencias son deliberadamente conservadoras. Un licuado o un waffle
 * consume helado, pero no se estima hasta conocer su receta: mostrarlo como
 * pendiente es mejor que inventar gramos y llamar merma a la diferencia.
 */
export function reglaParaVentaHelado(producto: string): ReglaHelado | null {
  const nombre = normalizar(producto);

  if (nombre.includes("HELADO") && nombre.includes("1/4")) return porId.get("cuarto") ?? null;
  if (nombre.includes("HELADO") && nombre.includes("1/2")) return porId.get("medio") ?? null;
  if (/HELADO.*\b1\s*KG\b|\b1\s*KG\b.*HELADO/.test(nombre)) return porId.get("kilo") ?? null;

  if (/CUCURUCH(?:O|ON)\s+3\s+SABOR/.test(nombre) || /HELADO\s+3\s+BOCHA/.test(nombre)) {
    return porId.get("bochas-3") ?? null;
  }
  if (/CUCURUCHO\s+2\s+SABOR/.test(nombre) || /HELADO\s+2\s+BOCHA/.test(nombre)) {
    return porId.get("bochas-2") ?? null;
  }
  if (
    /CUCURUCHO\s+1\s+SABOR/.test(nombre) ||
    /HELADO\s+1\s+BOCHA/.test(nombre) ||
    /\bBOCHA DE HELADO\b/.test(nombre)
  ) {
    return porId.get("bocha-1") ?? null;
  }

  return null;
}

/** Sólo los sabores facturados por peso, no potes, cucharas ni packaging. */
export function esHeladoComprado(detalle: string): boolean {
  return /^HELADO DE\b/.test(normalizar(detalle));
}

function esAccesorioSinHelado(producto: string): boolean {
  const nombre = normalizar(producto);
  return (
    /ADIC+IONAL CUCURUCHO/.test(nombre) ||
    /CUCURUCHO X\s*(?:1|UNID)/.test(nombre) ||
    /BALDE.*HELADO.*VACIO/.test(nombre)
  );
}

export function esVentaRelacionadaConHelado(producto: string): boolean {
  const nombre = normalizar(producto);
  return !esAccesorioSinHelado(nombre) && /HELADO|BOCHA|CUCURUCHO/.test(nombre);
}

export function resumirHelado(compras: CompraHelado[], ventas: VentaHelado[]): ResumenHelado {
  const formatos = new Map(
    REGLAS_HELADO.map((regla) => [
      regla.id,
      {
        id: regla.id,
        etiqueta: regla.etiqueta,
        gramosPorUnidad: regla.gramos,
        unidades: 0,
        kilos: 0,
      },
    ])
  );
  const sabores = new Map<string, { producto: string; kilos: number; costo: number }>();
  const sinRegla = new Map<string, { producto: string; cantidad: number }>();

  let compradoKg = 0;
  let costoComprado = 0;
  for (const compra of compras) {
    if (!esHeladoComprado(compra.detalle)) continue;
    compradoKg += compra.cantidadKg;
    costoComprado += compra.costo;
    const clave = normalizar(compra.detalle);
    const acumulado = sabores.get(clave) ?? { producto: compra.detalle, kilos: 0, costo: 0 };
    acumulado.kilos += compra.cantidadKg;
    acumulado.costo += compra.costo;
    sabores.set(clave, acumulado);
  }

  let unidadesConRegla = 0;
  let unidadesSinRegla = 0;
  let vendidoKgEstimado = 0;
  for (const venta of ventas) {
    const regla = reglaParaVentaHelado(venta.producto);
    if (regla) {
      const kilos = (venta.cantidad * regla.gramos) / 1000;
      const formato = formatos.get(regla.id)!;
      formato.unidades += venta.cantidad;
      formato.kilos += kilos;
      unidadesConRegla += venta.cantidad;
      vendidoKgEstimado += kilos;
      continue;
    }
    if (!esVentaRelacionadaConHelado(venta.producto)) continue;
    unidadesSinRegla += venta.cantidad;
    const clave = normalizar(venta.producto);
    const acumulado = sinRegla.get(clave) ?? { producto: venta.producto, cantidad: 0 };
    acumulado.cantidad += venta.cantidad;
    sinRegla.set(clave, acumulado);
  }

  const unidadesRelacionadas = unidadesConRegla + unidadesSinRegla;
  return {
    compradoKg,
    costoComprado,
    costoPorKg: compradoKg > 0 ? costoComprado / compradoKg : null,
    vendidoKgEstimado,
    balanceKg: compradoKg > 0 ? compradoKg - vendidoKgEstimado : null,
    ratioVendidoCompradoPct: compradoKg > 0 ? (vendidoKgEstimado / compradoKg) * 100 : null,
    unidadesConRegla,
    unidadesSinRegla,
    coberturaPct: unidadesRelacionadas > 0 ? (unidadesConRegla / unidadesRelacionadas) * 100 : null,
    formatos: [...formatos.values()].filter((formato) => formato.unidades > 0),
    sabores: [...sabores.values()].sort((a, b) => b.kilos - a.kilos),
    sinRegla: [...sinRegla.values()].sort((a, b) => b.cantidad - a.cantidad),
  };
}
