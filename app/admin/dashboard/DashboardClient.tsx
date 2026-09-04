"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageTitle, SectionTitle, Spinner } from "@/components/ui";

type Mapa = Record<string, number>;
type LocalDash = {
  localId: string;
  nombre: string;
  tieneFudo: boolean;
  sincronizadoEn: string | null;
  diasConDatos: number;
  ventas: number;
  ventasPrevio: number;
  variacionVentas: number | null;
  tickets: number;
  ticketPromedio: number;
  ticketPromedioPrevio: number;
  personas: number;
  descuentos: number;
  porcentajeDescuentos: number;
  anulaciones: number;
  gastos: number;
  costo: number;
  costoIncompleto: boolean;
  foodCost: number;
  resultado: number;
  porMedioPago: Mapa;
  porCanal: Mapa;
  porCategoria: Mapa;
  descuentosPorCaja: Mapa;
  topProductos: { nombre: string; valor: number }[];
};
type Dash = {
  periodo: string;
  dias: number;
  cadena: {
    ventas: number;
    ventasPrevio: number;
    variacionVentas: number | null;
    tickets: number;
    ticketPromedio: number;
    descuentos: number;
    anulaciones: number;
    gastos: number;
    costo: number;
    resultado: number;
    localesSinFudo: string[];
  };
  locales: LocalDash[];
  alertas: { tono: "rose" | "amber"; texto: string }[];
};

const PERIODOS = [
  { clave: "hoy", label: "Hoy" },
  { clave: "semana", label: "7 días" },
  { clave: "mes", label: "30 días" },
  { clave: "anio", label: "Año" },
];

const ETIQUETA_CANAL: Record<string, string> = {
  "EAT-IN": "Salón",
  TAKEAWAY: "Take away",
  DELIVERY: "Delivery",
  "SIN-CANAL": "Sin canal",
};

/** Miles con separador argentino: $7.571.847 se lee de un vistazo, 7571847 no. */
function plata(n: number): string {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

function Variacion({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-sm text-slate-400 dark:text-[#74817b]">sin período previo</span>;
  const sube = valor >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${
        sube ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"
      }`}
    >
      <Icono size={15} />
      {sube ? "+" : ""}
      {valor.toFixed(1)}% vs. período anterior
    </span>
  );
}

/** Share de un total como barras horizontales: un solo tono, ordenadas de
 * mayor a menor y con el valor al lado. Sin torta y sin una paleta por
 * categoría, que acá sólo agregaría ruido de color. */
function Reparto({ titulo, datos, etiquetas }: { titulo: string; datos: Mapa; etiquetas?: Record<string, string> }) {
  const filas = Object.entries(datos).sort((a, b) => b[1] - a[1]);
  const total = filas.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">{titulo}</p>
      {filas.map(([nombre, valor]) => {
        const pct = (valor / total) * 100;
        return (
          <div key={nombre} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-slate-600 dark:text-[#c1cbc6]">{etiquetas?.[nombre] ?? nombre}</span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-[#94a19c]">
                {pct.toFixed(0)}% · {plata(valor)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-[#18201d]">
              <div
                className="h-full rounded-full bg-emerald-600 dark:bg-[#37e6b0]"
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Stock = {
  diasEnSerie: number;
  productosSeguidos: number;
  movimientos: {
    fecha: string;
    local: string;
    producto: string;
    stock: number;
    vendido: number;
    movimiento: number;
  }[];
};

/**
 * Fudo no guarda la historia del stock (devuelve el de ahora), así que la
 * serie se arma con una foto diaria. Con la foto de ayer y lo vendido hoy,
 * lo que no cierra es mercadería que entró, un recuento a mano o un faltante.
 */
function SerieStock() {
  const [stock, setStock] = useState<Stock | null>(null);

  useEffect(() => {
    fetch("/api/stock")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStock)
      .catch(() => setStock(null));
  }, []);

  if (!stock || stock.productosSeguidos === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle
        action={
          <span className="text-xs text-slate-400 dark:text-[#74817b]">
            {stock.productosSeguidos} productos · {stock.diasEnSerie}{" "}
            {stock.diasEnSerie === 1 ? "día" : "días"} de serie
          </span>
        }
      >
        Movimientos de stock sin explicar
      </SectionTitle>

      {stock.movimientos.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          {stock.diasEnSerie <= 1
            ? "La serie arrancó hoy: la primera comparación sale mañana, cuando haya una foto anterior contra la cual medir."
            : "Ningún producto se movió por fuera de lo que explican las ventas."}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">
            Diferencia entre el stock de hoy y el de ayer menos lo vendido. Positivo suele ser
            mercadería que entró; negativo, faltante o ajuste a mano.
          </p>
          <div className="flex flex-col gap-1.5">
            {stock.movimientos.map((m) => (
              <div key={`${m.fecha}-${m.local}-${m.producto}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-slate-600 dark:text-[#c1cbc6]">
                  {m.producto}
                  <span className="ml-1.5 text-xs text-slate-400 dark:text-[#74817b]">
                    {m.local} · {m.fecha}
                  </span>
                </span>
                <span
                  className={`shrink-0 tabular-nums font-semibold ${
                    m.movimiento < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-[#94a19c]"
                  }`}
                >
                  {m.movimiento > 0 ? "+" : ""}
                  {m.movimiento.toLocaleString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export default function DashboardClient() {
  const [periodo, setPeriodo] = useState("semana");
  const [datos, setDatos] = useState<Dash | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState("");

  const cargar = useCallback(async (p: string) => {
    setCargando(true);
    const res = await fetch(`/api/dashboard?periodo=${p}`);
    const d = await res.json();
    setDatos(res.ok ? d : null);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, no data lib
    cargar(periodo);
  }, [periodo, cargar]);

  async function sincronizar() {
    if (!datos) return;
    setSincronizando(true);
    setAvisoSync("");
    const conFudo = datos.locales.filter((l) => l.tieneFudo);
    const resultados = await Promise.all(
      conFudo.map(async (l) => {
        const res = await fetch(`/api/locales/${l.localId}/resumen/sync?dias=90`, { method: "POST" });
        return res.ok;
      })
    );
    const ok = resultados.filter(Boolean).length;
    setAvisoSync(`Sincronizados ${ok} de ${conFudo.length} locales.`);
    setSincronizando(false);
    cargar(periodo);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        subtitle="Facturación, tickets, mix y control, sacado de Fudo"
        actions={
          <Button type="button" variant="ghost" onClick={sincronizar} disabled={sincronizando || !datos}>
            <RefreshCw size={16} />
            {sincronizando ? "Sincronizando…" : "Sincronizar"}
          </Button>
        }
      >
        Dashboard
      </PageTitle>

      <div className="flex flex-wrap gap-1">
        {PERIODOS.map((p) => (
          <Button
            key={p.clave}
            type="button"
            variant={periodo === p.clave ? "primary" : "ghost"}
            onClick={() => setPeriodo(p.clave)}
            className="py-1.5 text-sm"
          >
            {p.label}
          </Button>
        ))}
      </div>

      {avisoSync && (
        <p className="text-sm font-medium text-emerald-700 dark:text-[#4ee6b0]">{avisoSync}</p>
      )}

      {cargando || !datos ? (
        <Spinner />
      ) : (
        <>
          {/* Lo primero de la pantalla: cuánto facturó la cadena. */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">
              Facturación total de la cadena
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{plata(datos.cadena.ventas)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Variacion valor={datos.cadena.variacionVentas} />
              <span className="text-sm text-slate-500 dark:text-[#94a19c]">
                {datos.cadena.tickets.toLocaleString("es-AR")} tickets · ticket promedio{" "}
                {plata(datos.cadena.ticketPromedio)}
              </span>
            </div>
            {datos.cadena.localesSinFudo.length > 0 && (
              <p className="mt-3 text-xs text-slate-400 dark:text-[#74817b]">
                No incluye {datos.cadena.localesSinFudo.join(", ")}: falta cargar sus credenciales de Fudo.
              </p>
            )}
          </Card>

          {datos.alertas.length > 0 && (
            <Card className="flex flex-col gap-2">
              <SectionTitle>Alertas</SectionTitle>
              {datos.alertas.map((a) => (
                <div key={a.texto} className="flex items-start gap-2 text-sm">
                  <AlertTriangle
                    size={15}
                    className={`mt-0.5 shrink-0 ${
                      a.tono === "rose" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                    }`}
                  />
                  <span className="text-slate-700 dark:text-[#c1cbc6]">{a.texto}</span>
                </div>
              ))}
            </Card>
          )}

          <SerieStock />

          {datos.locales.filter((l) => l.tieneFudo).length === 0 ? (
            <EmptyState>
              Ningún local tiene Fudo configurado todavía. Cargá las credenciales en Ajustes → la sucursal → Fudo.
            </EmptyState>
          ) : (
            <Card>
              <SectionTitle>Comparación entre locales</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                      <th className="py-2 pr-3 font-semibold">Local</th>
                      <th className="py-2 pr-3 text-right font-semibold">Ventas</th>
                      <th className="py-2 pr-3 text-right font-semibold">Var.</th>
                      <th className="py-2 pr-3 text-right font-semibold">Tickets</th>
                      <th className="py-2 pr-3 text-right font-semibold">Ticket prom.</th>
                      <th className="py-2 pr-3 text-right font-semibold">Desc.</th>
                      <th className="py-2 pr-3 text-right font-semibold">Food cost</th>
                      <th className="py-2 text-right font-semibold">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.locales
                      .filter((l) => l.tieneFudo)
                      .map((l) => (
                        <tr key={l.localId} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                          <td className="py-2 pr-3 font-semibold">{l.nombre}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{plata(l.ventas)}</td>
                          <td
                            className={`py-2 pr-3 text-right tabular-nums ${
                              l.variacionVentas == null
                                ? "text-slate-400 dark:text-[#74817b]"
                                : l.variacionVentas >= 0
                                  ? "text-emerald-700 dark:text-[#4ee6b0]"
                                  : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {l.variacionVentas == null
                              ? "—"
                              : `${l.variacionVentas >= 0 ? "+" : ""}${l.variacionVentas.toFixed(0)}%`}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{l.tickets.toLocaleString("es-AR")}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{plata(l.ticketPromedio)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{l.porcentajeDescuentos.toFixed(1)}%</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {l.costo > 0 ? `${l.foodCost.toFixed(0)}%${l.costoIncompleto ? "*" : ""}` : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums font-semibold">{plata(l.resultado)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {datos.locales.some((l) => l.costoIncompleto && l.costo > 0) && (
                <p className="mt-3 text-xs text-slate-400 dark:text-[#74817b]">
                  * Hay productos sin costo cargado en Fudo: el food cost real es mayor que el que se muestra.
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">
                Resultado = ventas − costo de lo vendido − gastos cargados en Fudo.
              </p>
            </Card>
          )}

          {datos.locales
            .filter((l) => l.tieneFudo && l.ventas > 0)
            .map((l) => (
              <Card key={l.localId} className="flex flex-col gap-5">
                <SectionTitle
                  action={
                    <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-[#4ee6b0]">
                      {plata(l.ventas)}
                    </span>
                  }
                >
                  {l.nombre}
                </SectionTitle>

                <div className="grid gap-5 md:grid-cols-3">
                  <Reparto titulo="Canal" datos={l.porCanal} etiquetas={ETIQUETA_CANAL} />
                  <Reparto titulo="Medios de pago" datos={l.porMedioPago} />
                  <Reparto titulo="Categorías" datos={l.porCategoria} />
                </div>

                {Object.keys(l.descuentosPorCaja).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">
                      Descuentos por caja
                    </p>
                    {Object.entries(l.descuentosPorCaja)
                      .sort((a, b) => b[1] - a[1])
                      .map(([caja, monto]) => (
                        <div key={caja} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate text-slate-600 dark:text-[#c1cbc6]">{caja}</span>
                          <span className="shrink-0 tabular-nums text-slate-500 dark:text-[#94a19c]">
                            {plata(monto)}
                            {l.descuentos > 0 && ` · ${((monto / l.descuentos) * 100).toFixed(0)}%`}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {l.topProductos.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">
                      Productos que más facturan
                    </p>
                    {l.topProductos.slice(0, 8).map((p) => (
                      <div key={p.nombre} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate text-slate-600 dark:text-[#c1cbc6]">{p.nombre}</span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-[#94a19c]">
                          {plata(p.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="slate">{l.personas.toLocaleString("es-AR")} personas atendidas</Badge>
                  <Badge tone={l.porcentajeDescuentos >= 5 ? "amber" : "slate"}>
                    {plata(l.descuentos)} en descuentos
                  </Badge>
                  {l.anulaciones > 0 && <Badge tone="amber">{plata(l.anulaciones)} anulado</Badge>}
                  {l.gastos > 0 && <Badge tone="slate">{plata(l.gastos)} en gastos</Badge>}
                  {l.sincronizadoEn && (
                    <Badge tone="slate">
                      Sincronizado {new Date(l.sincronizadoEn).toLocaleString("es-AR")}
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
        </>
      )}
    </div>
  );
}
