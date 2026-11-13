/**
 * Costo por plato: de qué está hecho cada producto de la carta y cuánto cuesta
 * hoy, con el precio de la última compra al proveedor.
 *
 * Vive en código, como `promos.ts` y `sectores.ts`: es el vocabulario del
 * negocio, se testea y se revisa en un diff. Las cantidades que no salen de un
 * remito (ml de leche por café, gramos de jamón por tostado) son supuestos de
 * barra y están escritos acá para que se puedan discutir y corregir.
 *
 * Todo es **sin IVA**: el costo es el neto de la factura (el IVA de compra se
 * recupera) y la venta se compara dividida por 1,21.
 */

import { DESCUENTO_FACTURA } from "./remito";
import { esHeladoComprado, reglaParaVentaHelado, reglasHelado, type GramosHelado, type ReglaHelado } from "./consumoHelado";
import { GRAMOS_DOBLE, GRAMOS_POR_INFUSION } from "./consumoCafe";
import { claveProducto } from "./sectores";

export type Insumo = {
  id: string;
  nombre: string;
  /** Contra el detalle normalizado de la línea de compra. */
  patron: RegExp | ((detalle: string) => boolean);
  /** Cuántas unidades de receta trae una unidad comprada: 12.000 ml el pack de leche. */
  porCompra: number;
  unidad: "g" | "ml" | "u";
  /**
   * Todos sus productos comparten una lista de precios (los sabores de helado):
   * cuando la última compra trae precio nuevo, rige para todos, aunque los
   * sabores que no se pidieron ese día todavía figuren con el viejo.
   */
  unaLista?: boolean;
};

const ins = (id: string, nombre: string, patron: Insumo["patron"], porCompra: number, unidad: Insumo["unidad"]): Insumo => ({
  id,
  nombre,
  patron,
  porCompra,
  unidad,
});

export const INSUMOS: Insumo[] = [
  ins("cafe", "Café Prestige en grano", /^CAFE PRESTIGE NEGRO/, 1000, "g"),
  ins("leche", "Leche entera", /^PACK LECHE ENTERA/, 12000, "ml"),
  ins("azucar", "Sobre de azúcar", /^AZUCAR EN SOBRES/, 800, "u"),
  ins("te", "Té Dilmah (saquito)", /^TE DILMAH/, 50, "u"),
  ins("cacao", "Cacao para capuccino", /^CACAO ALCALINO/, 100, "g"),
  ins("syrup", "Syrup vainilla", /^SYRUP/, 1000, "ml"),
  ins("barrita", "Barrita para submarino", /^BARRITAS PARA SUBMARINO/, 24, "u"),
  ins("medialuna", "Medialuna", /^MEDIALUNA BYN MANTECA/, 100, "u"),
  ins("tortita", "Tortita raspada", /^TORTITA RASPADA/, 100, "u"),
  ins("chipa", "Chipá prensado", /^CHIPA PRENSADO X 20/, 20, "u"),
  ins("croissant", "Croissant", /^CROISSANT X UNIDAD/, 1, "u"),
  ins("panTostado", "Pan de tostado", /^PAN TOSTADO X LOTE 40/, 40, "u"),
  // 10 rodajas por pan: confirmado por el dueño el 13/11/2026.
  ins("rodaja", "Rodaja de pan de campo", /^PAN DE MASA MADRE CAMPO/, 10, "u"),
  ins("panSemillas", "Pan de semillas", /^PAN DE MASA MADRE CON SEMILLAS/, 1, "u"),
  ins("panNueces", "Pan de nueces y pasas", /^PAN DE MASA MADRE NUECES/, 1, "u"),
  ins("jamon", "Jamón cocido", /^JAMON COCIDO HORMA/, 5900, "g"),
  ins("jamonCrudo", "Jamón crudo (porción)", /^JAMON CRUDO PARA FOCACCIA/, 10, "u"),
  ins("queso", "Queso en barra", /^QUESO EN BARRA HORMA/, 4000, "g"),
  ins("quesoCrema", "Queso crema", /^QUESO CREMA/, 1000, "g"),
  ins("palta", "Pulpa de palta", /^PULPA DE PALTA/, 450, "g"),
  ins("huevo", "Huevo", /^MAPLE HUEVO/, 30, "u"),
  ins("pollo", "Pollo (porción 80 g)", /^POLLO X 80G/, 1, "u"),
  ins("ternera", "Ternera braseada (porción)", /^TERNERA BRASEADA/, 1, "u"),
  ins("dulce", "Dulce de fruta (promedio)", /^DULCE DE (FRAMBUESA|DURAZNO)/, 1000, "g"),
  ins("nutella", "Nutella", /^SOBRE NUTELLA 500/, 500, "g"),
  ins("waffle", "Waffle", /^WAFLES X 2/, 2, "u"),
  ins("yogur", "Yogur griego", /^YOGURT NATURAL GRIEGO/, 1000, "g"),
  ins("muesli", "Muesli", /^MUESL/, 1000, "g"),
  // Cajón de 18 kg (el remito no dice el peso): confirmado por el dueño el 13/11/2026.
  ins("naranja", "Naranja", /^CAJON DE NARANJA/, 18000, "g"),
  ins("limon", "Limón", /^LIMON \(FRUTA\)/, 1000, "g"),
  ins("almibar", "Almíbar", /^ALMIBAR/, 1000, "ml"),
  ins("vasoJugo", "Vaso de jugo", /^VASO DESCARTABLE PARA JUGO/, 100, "u"),
  { ...ins("helado", "Helado", (d) => esHeladoComprado(d), 1000, "g"), unaLista: true },
  ins("pote1kg", "Pote de 1 kg", /^POTE DE HELADO 1 KG/, 25, "u"),
  ins("pote12", "Pote de 1/2 kg", /^POTE DE HELADO 1\/2/, 25, "u"),
  ins("pote14", "Pote de 1/4 kg", /^POTE DE HELADO 1\/4/, 25, "u"),
  ins("cucurucho", "Cucurucho", /^MINI CUCURUCHON DULCE/, 240, "u"),
  ins("cucuruchon", "Cucuruchón", /^CUCURUCHON DULCE/, 160, "u"),
  ins("monoporcion", "Monoporción (promedio)", /^MONOPORCION (DE )?(JAPANESE|MOUSSE|MOSSE|CHOCOTORTA|CARROT CAKE).* X 3 UN/, 3, "u"),
  ins("rogelChica", "Torta rogel chica", /^TORTA ROGEL DE DULCE DE LECHE CHICA/, 1, "u"),
  ins("rogelGrande", "Torta rogel grande", /^TORTA ROGEL DE DULCE DE LECHE GRANDE/, 1, "u"),
  ins("japaneseChica", "Torta japanese chica", /^TORTA JAPANESE CHICA/, 1, "u"),
  ins("japaneseGrande", "Torta japanese grande", /^TORTA JAPANESE GRANDE/, 1, "u"),
  ins("mousseChica", "Torta mousse chica", /^TORTA MOUSSE DE CHOCOLATE CHICA/, 1, "u"),
  ins("mousseGrande", "Torta mousse grande", /^TORTA MOUSSE DE CHOCOLATE GRANDE/, 1, "u"),
  ins("cheesecake", "Cheesecake", /^TORTA CHEESCAKE/, 1, "u"),
  ins("imperial", "Torta imperial (kg)", /^TORTA IMPERIAL/, 1, "u"),
  ins("chocotorta", "Chocotorta (kg)", /^TORTA CHOCOTORTA/, 1, "u"),
  ins("tartaFrutilla", "Tarta de frutilla", /^TARTA DE FRUTILLA/, 1, "u"),
  ins("lemonPie", "Lemon pie", /^TARTA LEMON PIE/, 1, "u"),
];

const POR_ID = new Map(INSUMOS.map((i) => [i.id, i]));

type Componente = { insumo: string; cantidad: number } | { receta: string; cantidad: number } | { helado: ReglaHelado["id"] };

export type Receta = {
  id: string;
  nombre: string;
  patron: RegExp;
  componentes: Componente[];
  /** Por qué esta receta es una hipótesis y no la carta: se muestra al lado. */
  supuesto?: string;
};

const i = (insumo: string, cantidad: number): Componente => ({ insumo, cantidad });
const r = (receta: string, cantidad = 1): Componente => ({ receta, cantidad });
const rec = (id: string, nombre: string, patron: RegExp, componentes: Componente[], supuesto?: string): Receta => ({
  id,
  nombre,
  patron,
  componentes,
  supuesto,
});

/** Una infusión: café, leche y el sobre de azúcar que va en el plato. */
const infusion = (gramos: number, leche = 0, extras: Componente[] = []) => [
  i("cafe", gramos),
  ...(leche ? [i("leche", leche)] : []),
  i("azucar", 1),
  ...extras,
];

/**
 * En orden: la primera que coincide gana. Las promos van primero porque su
 * nombre contiene el de lo que llevan ("PROMO TOSTÓN" no es un tostón), y lo
 * específico antes que lo general ("ESPRESSO DOBLE" antes que "ESPRESSO").
 */
export const RECETAS: Receta[] = [
  // Promos: la infusión de promo + el acompañamiento de la carta.
  rec("pMedioPanini", "Promo medio panini", /PROMO.*(MEDIO PANINI|MEDIO TOSTADO BRIOCHE)/, [r("infusionPromo"), r("medioTostado")]),
  rec("pPanini", "Promo panini / tostado brioche", /PROMO.*(PANINI|TOSTADO BRIOCHE)/, [r("infusionPromo"), r("tostado")]),
  rec("pTostadoEntero", "Promo tostado entero", /PROMO TOSTADO ENTERO/, [r("infusionPromo"), r("tostado")], "Se supone como la de tostado brioche"),
  rec("pToston", "Promo tostón", /PROMO TOST[OÓ]N/, [r("infusionPromo"), r("tostonAvocado")]),
  rec("pTostadaPalta", "Promo tostada palta y huevo", /PROMO TOSTADA.*PALTA/, [r("infusionPromo"), r("tostadasPalta")], "Se supone como las tostadas con huevo y palta"),
  rec("pCanasta", "Promo canasta de tostadas", /PROMO TOSTADAS 4|CANASTA ENTERA/, [r("infusionPromo"), r("tostadas", 2)]),
  rec("pTostadas", "Promo tostadas", /PROMO TOSTADAS|CANASTA 2 TOSTADAS/, [r("infusionPromo"), r("tostadas")]),
  rec("pChipa", "Promo chipá", /PROMO CHIPA/, [r("infusionPromo"), r("chipaJyq")]),
  rec("pProteico", "Promo proteico", /PROTEIC/, [r("infusionPromo"), i("rodaja", 2), i("huevo", 2), i("jamon", 30), i("quesoCrema", 30)]),
  rec("pLaminado", "Promo laminado", /PROMO LAMIN/, [r("infusionPromo"), i("croissant", 1), i("nutella", 20)]),
  rec("pClasica", "Promo clásica", /PROMO CL[AÁ]SICA/, [r("infusionPromo"), i("medialuna", 2)], "La mayoría elige 2 medialunas"),
  rec("pDulceAntojo", "Promo dulce antojo", /DULCE ANTOJO/, [r("infusionPromo"), i("monoporcion", 1)], "Con monoporción, la opción más elegida"),
  rec("pManana", "Promo mañana", /PROMO MA[NÑ]ANA/, [r("infusionPromo"), i("medialuna", 1)]),
  rec("pAmigos", "Desayuno amigos", /DESAYUNO AMIGOS/, [r("infusionPromo"), i("medialuna", 2)]),
  rec("pTalleres", "Promo talleres", /PROMO TALLERES/, [r("infusionPromo")]),

  // La infusión que llevan TODAS las promos: 14 g de café y 150 ml de leche.
  // Las cantidades las fijó el dueño.
  rec("infusionPromo", "Infusión de promo", /$^/, infusion(GRAMOS_POR_INFUSION, 150)),

  // Cafetería. 14 g por taza, el promedio que cerró el control de café al 99%.
  // La leche de cada bebida y las porciones de jamón y queso las confirmó el
  // dueño el 13/11/2026, igual que las promos Mañana (café + 1 medialuna),
  // Desayuno amigos (como la clásica) y Talleres (sólo la infusión).
  rec("espressoDoble", "Espresso doble", /ESPRESSO DOBLE|DOPPIO/, infusion(GRAMOS_DOBLE)),
  rec("espresso", "Espresso", /^ESPRESSO|^GOTEADO|^REFIL/, infusion(GRAMOS_POR_INFUSION)),
  rec("americano", "Americano", /^AMERICANO/, infusion(GRAMOS_POR_INFUSION)),
  rec("cortado", "Cortado", /^CORTADO|^CAFE PARA LLEVAR|^CAFE \(CON ECO VASO\)/, infusion(GRAMOS_POR_INFUSION, 40)),
  rec("manchadoGrande", "Manchado grande", /^MANCHADO GRANDE/, infusion(GRAMOS_POR_INFUSION, 200)),
  rec("manchado", "Manchado", /^MANCHADO/, infusion(GRAMOS_POR_INFUSION, 150)),
  rec("cafeXl", "Café XL / large", /^CAFE (XL|LARGE)/, infusion(GRAMOS_DOBLE, 250)),
  rec("cafeMediano", "Café mediano", /^CAFE MEDIANO/, infusion(GRAMOS_POR_INFUSION, 150)),
  rec("iceLatteSabor", "Ice latte vainilla / caramel", /^ICED? LATTE (VAINILLA|CARAMEL)/, infusion(GRAMOS_POR_INFUSION, 180, [i("syrup", 20)])),
  rec("iceLatte", "Ice latte", /^ICED? LATTE/, infusion(GRAMOS_POR_INFUSION, 180)),
  rec("latteSabor", "Latte vainilla / caramel", /^LATTE (VAINILLA|CARAMEL)/, infusion(GRAMOS_POR_INFUSION, 220, [i("syrup", 20)])),
  rec("latte", "Latte", /^LATTE/, infusion(GRAMOS_POR_INFUSION, 220)),
  rec("flatWhite", "Flat white", /^FLAT WHITE/, infusion(GRAMOS_POR_INFUSION, 150)),
  rec("capuccino", "Capuccino", /^CAP+UC+H?INO/, infusion(GRAMOS_POR_INFUSION, 150, [i("cacao", 2)])),
  rec("mocaccino", "Mocaccino", /^MOCAC+INO/, infusion(GRAMOS_POR_INFUSION, 150, [i("cacao", 10)])),
  rec("affogato", "Affogato", /^AFFOGATO/, [i("cafe", GRAMOS_POR_INFUSION), { helado: "bocha-1" }]),
  rec("submarino", "Submarino", /^SUBMARINO/, [i("leche", 250), i("barrita", 1), i("azucar", 1)]),
  rec("chocolatada", "Chocolatada fría", /^CHOCOLATADA/, [i("leche", 250), i("cacao", 20)]),
  rec("te", "Té", /^T[EÉ] DILMAH/, [i("te", 1), i("azucar", 1)]),

  // Bebidas.
  rec("dosMedios", "Dos potes de 1/2", /^\(PY\) 2 1\/2/, [{ helado: "medio" }, { helado: "medio" }]),
  rec("licuadoLeche", "Licuado de helado y leche", /^LICUADO DE HELADO Y LECHE/, [i("helado", 150), i("leche", 200)]),
  rec("licuadoJugo", "Licuado de helado y jugo", /^LICUADO DE HELADO Y JUGO/, [i("helado", 150), i("naranja", 650)]),
  rec("jugoGrande", "Jugo de naranja grande", /^JUGO (DE NARANJA )?GRANDE/, [i("naranja", 900), i("vasoJugo", 1)]),
  rec("jugoMediano", "Jugo de naranja mediano", /^JUGO (DE NARANJA )?MEDIANO|JUGO A TU PROMO|ADICIONAL JUGO MEDIANO/, [i("naranja", 650), i("vasoJugo", 1)]),
  rec("jarraLimonada", "Jarra de limonada", /^JARRA LIMONADA/, [i("limon", 400), i("almibar", 120)]),
  rec("limonada", "Limonada", /^LIMONADA/, [i("limon", 100), i("almibar", 30), i("vasoJugo", 1)]),

  // Panificados y brunch.
  rec("mediaDocena", "Media docena de medialunas", /^MEDIALUNAS 1\/2 DOC/, [i("medialuna", 6)]),
  rec("medialunaJyq", "Medialuna con jamón y queso", /^MEDIALUNA (CON )?(JAMON|JYQ)/, [i("medialuna", 1), i("jamon", 20), i("queso", 20)]),
  rec("medialuna", "Medialuna", /^MEDIALUNA/, [i("medialuna", 1)]),
  rec("tortitaJyq", "Tortita con jamón y queso", /^TORTITA (CON )?(JAMON|JYQ)/, [i("tortita", 1), i("jamon", 20), i("queso", 20)]),
  rec("tortita", "Tortita", /^TORTITA/, [i("tortita", 1)]),
  rec("chipaJyq", "Chipá prensado jamón y queso", /^CHIPA PRENSADO (JAMON|JYQ)/, [i("chipa", 1), i("jamon", 30), i("queso", 30)]),
  rec("croissantJyq", "Croissant jamón y queso", /^CROISSANT JYQ/, [i("croissant", 1), i("jamon", 30), i("queso", 30)]),
  rec("medioTostado", "Medio tostado", /^MEDIO TOSTADO/, [i("panTostado", 0.5), i("jamon", 30), i("queso", 30)]),
  rec("tostadoAve", "Tostado ave palta", /^(TOSTADO|SANDWICHE?) AVE PALTA/, [i("panTostado", 1), i("pollo", 1), i("palta", 60)]),
  rec("tostadoTernera", "Tostado ternera braseada", /^TOSTADO TERNERA/, [i("panTostado", 1), i("ternera", 1), i("queso", 30)]),
  rec("tostado", "Tostado de jamón y queso", /^TOSTADO (DE )?(JYQ|ENTERO)/, [i("panTostado", 1), i("jamon", 60), i("queso", 60)]),
  rec("tostonAvocado", "Tostón avocado", /^TOST[OÓ]N AVOCADO/, [i("rodaja", 2), i("palta", 80), i("huevo", 1)]),
  rec("tostonCrudo", "Tostón jamón crudo", /^TOST[OÓ]N JAMON CRUDO/, [i("rodaja", 2), i("jamonCrudo", 1), i("quesoCrema", 30)]),
  rec("tostadasPalta", "Tostadas con huevo y palta", /^TOSTADAS CON HUEVO Y PALTA/, [i("rodaja", 2), i("palta", 60), i("huevo", 2)]),
  rec("canasta", "Canasta de tostadas (4)", /^CANASTA DE TOSTADAS/, [r("tostadas", 2)]),
  rec("tostadas", "Tostadas (2) con queso y dulce", /^MEDIA CANASTA/, [i("rodaja", 2), i("quesoCrema", 20), i("dulce", 20)]),
  rec("panSemillas", "Pan de semillas en molde", /^PAN DE SEMILLAS/, [i("panSemillas", 1)]),
  rec("panCampo", "Pan de campo en molde", /^PAN DE CAMPO/, [i("rodaja", 10)]),
  rec("panNueces", "Pan de nueces y pasas", /^PAN (CON|DE) NUECES/, [i("panNueces", 1)]),
  rec("omelette", "Omelette de jamón y queso", /^OMELETTE/, [i("huevo", 3), i("jamon", 40), i("queso", 40)]),
  rec("waffleNutella", "Waffle nutella", /^WAFFLE NUTELLA/, [i("waffle", 2), i("nutella", 40)]),
  rec("wafflePalta", "Waffle palta", /^WAFFLE PALTA/, [i("waffle", 2), i("palta", 60)]),
  rec("bowl", "Bowl de yogur y granola", /^(BOWL GRANOLA|YOGUR CON GRANOLA)/, [i("yogur", 200), i("muesli", 50)]),

  // Pastelería que se revende tal cual llega.
  rec("rogelChico", "Rogel chico", /ROGEL (DE )?(DDL )?CHIC[OA]/, [i("rogelChica", 1)]),
  rec("rogelGrande", "Rogel grande", /ROGEL (DE )?(DDL )?GRANDE/, [i("rogelGrande", 1)]),
  rec("japaneseChica", "Japanese chica", /^(TORTA )?JAPANESE CHICA/, [i("japaneseChica", 1)]),
  rec("japaneseGrande", "Japanese grande", /^(TORTA )?JAPANESE GRANDE/, [i("japaneseGrande", 1)]),
  rec("mousseChica", "Mousse chica", /^MOUSSE CHOCO\w* CHICA/, [i("mousseChica", 1)]),
  rec("mousseGrande", "Mousse grande", /^(TORTA )?MOUSSE CHOCO\w* GRANDE/, [i("mousseGrande", 1)]),
  rec("cheesecake", "Cheesecake", /^CHEESECAKE (2KG|CON FRUTOS)/, [i("cheesecake", 1)]),
  rec("imperial", "Imperial por kg", /^IMPERIAL X KG/, [i("imperial", 1)]),
  rec("chocotorta", "Chocotorta por kg", /^CHOCOTORTA X KG/, [i("chocotorta", 1)]),
  rec("tartaFrutilla", "Tarta de frutilla", /^TARTA DE FRUTILLAS?$/, [i("tartaFrutilla", 1)]),
  rec("lemonPie", "Lemon pie", /^LEMON PIE/, [i("lemonPie", 1)]),
  rec("monoporcion", "Monoporción", /^MONOPORCI[OÓ]N/, [i("monoporcion", 1)]),
];

const RECETA_POR_ID = new Map(RECETAS.map((x) => [x.id, x]));

/** Helado por formato: los gramos editables de Compras + el pote o cucurucho. */
const ENVASE: Record<ReglaHelado["id"], string> = {
  "bocha-1": "cucurucho",
  "bochas-2": "cucurucho",
  "bochas-3": "cucuruchon",
  cuarto: "pote14",
  medio: "pote12",
  kilo: "pote1kg",
};

export type LineaCompra = { detalle: string; precioUnitario: number; fecha: string; esFactura: boolean };

/** El último precio neto de un producto del proveedor, y el que tenía antes. */
export type UltimoPrecio = {
  detalle: string;
  precio: number;
  fecha: string;
  /** El precio antes del último cambio (más de medio punto), y desde cuándo rige el nuevo. */
  anterior: number | null;
  vigenteDesde: string | null;
};

export type PrecioInsumo = {
  id: string;
  nombre: string;
  unidad: Insumo["unidad"];
  /** Neto sin IVA por unidad comprada (el pack, el kilo, el cajón). */
  precioCompra: number;
  /** Neto por unidad de receta (por gramo, ml o unidad). */
  porUnidad: number;
  porCompra: number;
  fecha: string;
  /** Los productos del proveedor que promedia: los sabores de helado, las dos medialunas. */
  detalles: string[];
};

function coincide(insumo: Insumo, detalle: string) {
  return typeof insumo.patron === "function" ? insumo.patron(detalle) : insumo.patron.test(detalle);
}

/** El insumo al que pertenece un producto del proveedor, por su nombre normalizado. */
export function insumoDe(detalle: string): Insumo | undefined {
  return INSUMOS.find((x) => coincide(x, detalle));
}

/**
 * El precio vigente de cada producto del proveedor, por su nombre normalizado.
 *
 * La factura ya trae el neto (lista −5%); el remito trae la lista, así que se
 * le aplica el mismo 5% para que las dos lecturas den lo mismo. Va producto
 * por producto: promediar por día mezclaba la medialuna preleudada con la
 * común y una diferencia de producto parecía una suba.
 */
export function ultimosPrecios(lineas: LineaCompra[]): Map<string, UltimoPrecio> {
  const series = new Map<string, Map<string, { suma: number; n: number; detalle: string }>>();
  for (const linea of lineas) {
    if (!(linea.precioUnitario > 0)) continue;
    const clave = claveProducto(linea.detalle);
    const neto = linea.esFactura ? linea.precioUnitario : linea.precioUnitario * (1 - DESCUENTO_FACTURA);
    const dias = series.get(clave) ?? new Map();
    const dia = dias.get(linea.fecha) ?? { suma: 0, n: 0, detalle: linea.detalle };
    dia.suma += neto;
    dia.n += 1;
    dias.set(linea.fecha, dia);
    series.set(clave, dias);
  }

  const ultimos = new Map<string, UltimoPrecio>();
  for (const [clave, dias] of series) {
    const serie = [...dias].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, d]) => ({ fecha, precio: d.suma / d.n, detalle: d.detalle }));
    const ultimo = serie[serie.length - 1];
    // Hacia atrás hasta el primer precio distinto: ese es el anterior, y el
    // día siguiente es desde cuándo rige el actual.
    let desde = ultimo.fecha;
    let anterior: number | null = null;
    for (let k = serie.length - 2; k >= 0; k--) {
      if (Math.abs(serie[k].precio / ultimo.precio - 1) > 0.005) {
        anterior = serie[k].precio;
        break;
      }
      desde = serie[k].fecha;
    }
    ultimos.set(clave, { detalle: ultimo.detalle, precio: ultimo.precio, fecha: ultimo.fecha, anterior, vigenteDesde: anterior == null ? null : desde });
  }
  return ultimos;
}

/** Un producto que no se compra hace dos meses ya no es parte del insumo. */
const VIGENCIA_DIAS = 60;

/** El precio de cada insumo: el promedio de sus productos vigentes. */
export function preciosDeInsumos(ultimos: Map<string, UltimoPrecio>): Map<string, PrecioInsumo> {
  const precios = new Map<string, PrecioInsumo>();
  for (const insumo of INSUMOS) {
    const propios = [...ultimos].filter(([clave]) => coincide(insumo, clave)).map(([, u]) => u);
    if (propios.length === 0) continue;
    const fecha = propios.reduce((max, u) => (u.fecha > max ? u.fecha : max), "");
    const limite = new Date(Date.parse(fecha) - VIGENCIA_DIAS * 86_400_000).toISOString().slice(0, 10);
    const vigentes = propios.filter((u) => (insumo.unaLista ? u.fecha === fecha : u.fecha >= limite));
    const precioCompra = vigentes.reduce((s, u) => s + u.precio, 0) / vigentes.length;
    precios.set(insumo.id, {
      id: insumo.id,
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      precioCompra,
      porUnidad: precioCompra / insumo.porCompra,
      porCompra: insumo.porCompra,
      fecha,
      detalles: vigentes.map((u) => u.detalle),
    });
  }
  return precios;
}

export type LineaCosto = { nombre: string; cantidad: number; unidad: string; costo: number };

export type Costeo = {
  receta: string;
  costo: number;
  componentes: LineaCosto[];
  /** Insumos de la receta que no tienen precio: el costo está incompleto. */
  faltan: string[];
  supuesto?: string;
};

function expandir(
  componentes: Componente[],
  factor: number,
  precios: Map<string, PrecioInsumo>,
  gramos: Map<string, number>,
  salida: { lineas: Map<string, LineaCosto>; faltan: Set<string> }
) {
  for (const c of componentes) {
    if ("receta" in c) {
      expandir(RECETA_POR_ID.get(c.receta)!.componentes, factor * c.cantidad, precios, gramos, salida);
      continue;
    }
    if ("helado" in c) {
      expandir([i("helado", gramos.get(c.helado) ?? 0), i(ENVASE[c.helado], 1)], factor, precios, gramos, salida);
      continue;
    }
    const insumo = POR_ID.get(c.insumo)!;
    const precio = precios.get(c.insumo);
    if (!precio) {
      salida.faltan.add(insumo.nombre);
      continue;
    }
    const cantidad = c.cantidad * factor;
    const linea = salida.lineas.get(c.insumo) ?? { nombre: insumo.nombre, cantidad: 0, unidad: insumo.unidad, costo: 0 };
    linea.cantidad += cantidad;
    linea.costo += cantidad * precio.porUnidad;
    salida.lineas.set(c.insumo, linea);
  }
}

/** La receta que corresponde a un producto vendido, o null. */
export function recetaDe(producto: string): Receta | null {
  const nombre = claveProducto(producto);
  const receta = RECETAS.find((x) => x.patron.test(nombre));
  if (receta) return receta;
  // El helado por formato sale de las mismas reglas que el control de helado.
  const regla = reglaParaVentaHelado(nombre);
  return regla ? { id: `helado-${regla.id}`, nombre: regla.etiqueta, patron: /$^/, componentes: [{ helado: regla.id }] } : null;
}

/** Costo de una unidad vendida, con el desglose. Null si no hay receta. */
export function costear(producto: string, precios: Map<string, PrecioInsumo>, ajustesHelado: GramosHelado = {}): Costeo | null {
  const receta = recetaDe(producto);
  if (!receta) return null;
  const gramos = new Map(reglasHelado(ajustesHelado).map((x) => [x.id, x.gramos]));
  const salida = { lineas: new Map<string, LineaCosto>(), faltan: new Set<string>() };
  expandir(receta.componentes, 1, precios, gramos, salida);
  const componentes = [...salida.lineas.values()].sort((a, b) => b.costo - a.costo);
  return {
    receta: receta.nombre,
    costo: componentes.reduce((s, x) => s + x.costo, 0),
    componentes,
    faltan: [...salida.faltan],
    supuesto: receta.supuesto,
  };
}

/**
 * Lo que se revende tal cual llega y se llama igual en Fudo que en la factura
 * ("PRESENTACION ALARGADA 13 BOMBONES"): cuesta lo que se pagó la última vez.
 */
export function costoDeReventa(producto: string, ultimos: Map<string, UltimoPrecio>): Costeo | null {
  const u = ultimos.get(claveProducto(producto).replace(/[.\s]+$/, ""));
  if (!u) return null;
  return {
    receta: "Se revende como llega",
    costo: u.precio,
    componentes: [{ nombre: u.detalle, cantidad: 1, unidad: "u", costo: u.precio }],
    faltan: [],
  };
}
