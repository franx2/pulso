"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { BarraContexto, SelectorLocal } from "@/components/BarraContexto";
import { Badge, EmptyState, Metrica, PageTitle, Panel, SelectorSegmentado } from "@/components/ui";
import { fechaLarga, plata, porcentaje as pct } from "@/lib/formato";
import BancoPanel from "./BancoPanel";

type Vista = "resumen" | "banco";
const VISTAS: { clave: Vista; label: string }[] = [
  { clave: "resumen", label: "Resumen" },
  { clave: "banco", label: "Banco" },
];

/**
 * Resultado operativo.
 *
 * Todas las piezas ya existían y ninguna pantalla las sumaba: el margen por
 * sector estaba en Sectores, la mercadería en Compras, los sueldos en
 * Reportes, el alquiler en Configuración. Cada una contestaba su pregunta y
 * ninguna contestaba si el mes cerró arriba o abajo.
 *
 * La regla de esta pantalla es que una línea sin dato se marca y no se pone en
 * cero. Un resultado construido sobre ceros da siempre mejor que el real, que
 * es exactamente la forma más cara de equivocarse.
 */

type Linea = {
  id: string;
  etiqueta: string;
  monto: number;
  porcentaje: number;
  nota: string;
  completa: boolean;
  falta?: string;
};

type ResultadoLocal = {
  localId: string;
  local: string;
  ventaBruta: number;
  ventaNeta: number;
  lineas: Linea[];
  resultado: number;
  resultadoPct: number;
  incompletas: number;
  iva: { debito: number; credito: number; aPagar: number };
};

type Respuesta = {
  desde: string;
  hasta: string;
  dias: number;
  meses: string[];
  locales: { id: string; nombre: string }[];
  porLocal: ResultadoLocal[];
};

/** Dónde se carga cada cosa que puede faltar. */
const ARREGLO: Record<string, { texto: string; href: string }> = {
  mercaderia: { texto: "Ver compras", href: "/admin/compras" },
  comisiones: { texto: "Cargar comisiones", href: "/admin/configuracion" },
  laboral: { texto: "Cargar precio/hora", href: "/admin/empleados" },
  fijos: { texto: "Cargar gastos del mes", href: "/admin/configuracion" },
};

export default function ResultadoClient() {
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const [localId, setLocalId] = useState("");
  const [vista, setVista] = useState<Vista>("resumen");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    const params = new URLSearchParams(periodo);
    if (localId) params.set("localId", localId);
    fetch(`/api/resultado?${params}`, { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then(setDatos)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError("No pudimos calcular el resultado.");
        }
      });
    return () => controlador.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.toString(), localId]);

  if (error) return <p className="text-sm text-slate-500 dark:text-[#94a19c]">{error}</p>;

  // La cadena es la suma de sus locales, no un promedio: cada sucursal tiene
  // sus propias comisiones y sus propios gastos.
  const total = datos ? sumar(datos.porLocal) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle="De la venta al resultado, con lo que cuesta cada cosa">
        Resultado operativo
      </PageTitle>

      <BarraContexto
        campos={[
          {
            etiqueta: "Local",
            contenido: <SelectorLocal locales={datos?.locales ?? []} valor={localId} onChange={setLocalId} />,
          },
        ]}
        derecha={{ etiqueta: "Período", contenido: <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} rango={datos} /> }}
        pie={{
          alcance: (datos?.locales ?? []).find((l) => l.id === localId)?.nombre ?? "Toda la cadena",
          detalle: datos ? `${fechaLarga(datos.desde)} a ${fechaLarga(datos.hasta)}` : undefined,
        }}
      />

      <div className="scrollbar-hidden overflow-x-auto">
        <SelectorSegmentado opciones={VISTAS} valor={vista} onChange={setVista} label="Vista de resultado" />
      </div>

      {vista === "banco" && (
        <BancoPanel
          localId={localId}
          periodo={periodo}
          onPeriodoDetectado={(mes) => setValor({ ...valor, periodo: "mes-calendario", mes })}
        />
      )}

      {vista === "resumen" &&
        (!datos || !total ? (
        <div className="h-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Calculando" />
      ) : total.ventaBruta === 0 ? (
        <EmptyState>No hay ventas sincronizadas en este período.</EmptyState>
      ) : (
        <>
          <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 xl:grid-cols-4 xl:divide-y-0 dark:divide-[#29403b] dark:border-[#29403b]">
            <Metrica
              label="Venta neta"
              valor={plata(total.ventaNeta)}
              nota={`${plata(total.ventaBruta)} con IVA`}
            />
            <Metrica
              label="Costos del período"
              valor={plata(Math.abs(total.lineas.reduce((s, l) => s + l.monto, 0)))}
              nota={`${pct((Math.abs(total.lineas.reduce((s, l) => s + l.monto, 0)) / total.ventaNeta) * 100)} de la venta neta`}
            />
            <Metrica
              label="Resultado operativo"
              valor={plata(total.resultado)}
              tono={total.resultado >= 0 ? "positivo" : "negativo"}
              nota={pct(total.resultadoPct)}
            />
            <Metrica
              label="IVA a depositar"
              valor={plata(total.iva.aPagar)}
              tono="advertencia"
              nota="No es un gasto: se cobró y se deposita"
            />
          </section>

          {total.incompletas > 0 && (
            <Panel className="border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {total.incompletas === 1
                    ? "Una línea se apoya en datos incompletos"
                    : `${total.incompletas} líneas se apoyan en datos incompletos`}
                  : lo que falta no se puso en cero, pero el resultado de abajo sale mejor de lo
                  que va a ser cuando esté todo cargado.
                </span>
              </p>
            </Panel>
          )}

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
              <h2 className="font-semibold">
                {localId ? datos.locales.find((l) => l.id === localId)?.nombre : "Toda la cadena"}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
                Todo en netos de IVA. El IVA no es un costo para un responsable inscripto: se
                cobra y se paga, y va aparte.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100 dark:border-[#1c2521]">
                    <td className="py-3 pl-4 pr-2 font-semibold">Venta neta</td>
                    <td className="whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums">
                      {plata(total.ventaNeta)}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-2 pr-4 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                      100,0%
                    </td>
                  </tr>
                  {total.lineas.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 dark:border-[#1c2521]">
                      <td className="py-3 pl-4 pr-2">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {l.etiqueta}
                          {!l.completa && (
                            <Badge tone="amber">
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle size={11} aria-hidden />
                                incompleto
                              </span>
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-[#94a19c]">
                          {l.falta ?? l.nota}
                          {l.falta && ARREGLO[l.id] && (
                            <Link
                              href={ARREGLO[l.id].href}
                              className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-emerald-700 hover:underline dark:text-[#4ee6b0]"
                            >
                              {ARREGLO[l.id].texto}
                              <ArrowRight size={11} aria-hidden />
                            </Link>
                          )}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{plata(l.monto)}</td>
                      <td className="whitespace-nowrap py-3 pl-2 pr-4 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                        {pct(l.porcentaje)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 dark:border-[#29403b]">
                    <td className="py-3.5 pl-4 pr-2 text-base font-semibold">Resultado operativo</td>
                    <td
                      className={`whitespace-nowrap px-2 py-3.5 text-right text-base font-bold tabular-nums ${
                        total.resultado >= 0
                          ? "text-emerald-700 dark:text-[#4ee6b0]"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {plata(total.resultado)}
                    </td>
                    <td
                      className={`whitespace-nowrap py-3.5 pl-2 pr-4 text-right font-semibold tabular-nums ${
                        total.resultado >= 0
                          ? "text-emerald-700 dark:text-[#4ee6b0]"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {pct(total.resultadoPct)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-[#1c2521] dark:text-[#94a19c]">
              El resultado operativo es antes de impuesto a las ganancias, amortizaciones y
              cualquier retiro de los socios. IVA del período: {plata(total.iva.debito)} de débito
              menos {plata(total.iva.credito)} de crédito ={" "}
              <strong className="font-semibold">{plata(total.iva.aPagar)}</strong> a depositar. El
              crédito es cero mientras los remitos sean «Presupuesto X», que no es un comprobante
              fiscal.
            </p>
          </Panel>

          {!localId && datos.porLocal.length > 1 && (
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
                <h2 className="font-semibold">Por sucursal</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
                  Cada una con sus propias comisiones y sus propios gastos.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-[#26312d] dark:text-[#7a8882]">
                      <th className="py-2 pl-4 pr-2 font-semibold">Local</th>
                      <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Venta neta</th>
                      <th className="px-2 py-2 text-right font-semibold sm:px-3">Resultado</th>
                      <th className="py-2 pl-2 pr-4 text-right font-semibold">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                    {[...datos.porLocal]
                      .sort((a, b) => b.resultado - a.resultado)
                      .map((l) => (
                        <tr key={l.localId}>
                          <td className="py-2.5 pl-4 pr-2">
                            <span className="inline-flex flex-wrap items-center gap-2 font-medium">
                              {l.local}
                              {l.incompletas > 0 ? (
                                <Badge tone="amber">{l.incompletas} sin cargar</Badge>
                              ) : (
                                <CheckCircle2
                                  size={14}
                                  className="text-emerald-700 dark:text-[#4ee6b0]"
                                  aria-label="datos completos"
                                />
                              )}
                            </span>
                          </td>
                          <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{plata(l.ventaNeta)}</td>
                          <td
                            className={`whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums sm:px-3 ${
                              l.resultado >= 0
                                ? "text-emerald-700 dark:text-[#4ee6b0]"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {plata(l.resultado)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                            {pct(l.resultadoPct)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ))}
    </div>
  );
}

/** La cadena: se suman los montos y se recalculan los porcentajes sobre el total. */
function sumar(locales: ResultadoLocal[]): ResultadoLocal | null {
  if (locales.length === 0) return null;
  if (locales.length === 1) return locales[0];

  const ventaNeta = locales.reduce((s, l) => s + l.ventaNeta, 0);
  const lineas = locales[0].lineas.map((plantilla) => {
    const monto = locales.reduce(
      (s, l) => s + (l.lineas.find((x) => x.id === plantilla.id)?.monto ?? 0),
      0
    );
    const incompletas = locales.filter(
      (l) => !(l.lineas.find((x) => x.id === plantilla.id)?.completa ?? true)
    );
    return {
      ...plantilla,
      monto,
      porcentaje: ventaNeta > 0 ? (monto / ventaNeta) * 100 : 0,
      completa: incompletas.length === 0,
      falta:
        incompletas.length > 0
          ? `Falta en ${incompletas.map((l) => l.local).join(", ")}`
          : undefined,
    };
  });

  const resultado = locales.reduce((s, l) => s + l.resultado, 0);
  return {
    localId: "",
    local: "Toda la cadena",
    ventaBruta: locales.reduce((s, l) => s + l.ventaBruta, 0),
    ventaNeta,
    lineas,
    resultado,
    resultadoPct: ventaNeta > 0 ? (resultado / ventaNeta) * 100 : 0,
    incompletas: lineas.filter((l) => !l.completa).length,
    iva: {
      debito: locales.reduce((s, l) => s + l.iva.debito, 0),
      credito: locales.reduce((s, l) => s + l.iva.credito, 0),
      aPagar: locales.reduce((s, l) => s + l.iva.aPagar, 0),
    },
  };
}
