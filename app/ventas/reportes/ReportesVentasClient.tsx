"use client";

import { useCallback, useEffect, useState } from "react";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { SelectorLocal } from "@/components/BarraContexto";
import { ErrorText, PageTitle, Panel } from "@/components/ui";
import { fechaLarga, numero, plata, plataCompacta } from "@/lib/formato";
import type { Reporte } from "@/lib/ventas/reportes";
import { ETIQUETA_MOTIVO, NavVentas, useLocalVentas } from "../comun";
import { BarrasHorizontales, BarrasVerticales, COLOR_CAT, Indicador, PanelGrafico } from "../graficos";

type Respuesta = Reporte & { desde: string; hasta: string; anterior: { desde: string; hasta: string }; ordenMedios: string[] };

const ORDEN_ORIGEN = ["Mostrador", "Mesas", "Delivery"];
const ORDEN_MOTIVO = Object.keys(ETIQUETA_MOTIVO);
const diaCorto = (dia: string) => {
  const [, m, d] = dia.split("-");
  return `${Number(d)}/${Number(m)}`;
};

async function pedir(url: string) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
  return data;
}

export default function ReportesVentasClient() {
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");

  const clavePeriodo = periodo.toString();
  const cargar = useCallback(async () => {
    const salon = await pedir(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`);
    setLocales(salon.locales);
    setLocalId(salon.localId ?? "");
    if (!salon.localId) return;
    const params = new URLSearchParams(clavePeriodo);
    params.set("localId", salon.localId);
    setDatos(await pedir(`/api/ventas/reportes?${params}`));
    setError("");
  }, [localGuardado, clavePeriodo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reactivo al período y al local
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  const local = locales.find((l) => l.id === localId)?.nombre;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle subtitle={local ? `Lo vendido en ${local} con el módulo de ventas` : undefined} actions={<NavVentas activo="reportes" />}>
        Reportes de ventas
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {locales.length > 1 && <SelectorLocal locales={locales} valor={localId} onChange={setLocalGuardado} todos={null} />}
        <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} rango={datos ?? undefined} />
        {datos && (
          <p className="text-xs text-slate-500 dark:text-[#94a19c]">
            {fechaLarga(datos.desde)} a {fechaLarga(datos.hasta)} · contra {fechaLarga(datos.anterior.desde)} a {fechaLarga(datos.anterior.hasta)}
          </p>
        )}
      </div>

      <ErrorText>{error}</ErrorText>
      {!datos ? (
        !error && <div className="h-96 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando reportes" />
      ) : (
        <Contenido datos={datos} />
      )}
    </div>
  );
}

function Contenido({ datos }: { datos: Respuesta }) {
  const { indicadores: k } = datos;
  const cada = Math.max(1, Math.ceil(datos.evolucion.length / 12));
  // Las horas con movimiento, de la primera a la última: el resto del día es aire.
  const conVentas = datos.porHora.filter((h) => h.cantidad > 0).map((h) => h.hora);
  const horas = conVentas.length ? datos.porHora.slice(Math.min(...conVentas), Math.max(...conVentas) + 1) : datos.porHora.slice(8, 22);
  const colorMedio = (nombre: string) => COLOR_CAT(Math.max(0, datos.ordenMedios.indexOf(nombre)));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Indicador etiqueta="Total de ventas brutas" valor={plata(k.brutas.valor)} variacion={k.brutas.variacion} />
        <Indicador etiqueta="Total de ventas netas" valor={plata(k.netas.valor)} variacion={k.netas.variacion} />
        <Indicador etiqueta="Descuentos" valor={plata(k.descuentos.valor)} variacion={k.descuentos.variacion} invertir />
        <Indicador etiqueta="Cantidad de ventas" valor={numero(k.cantidad.valor)} variacion={k.cantidad.variacion} />
        <Indicador etiqueta="Promedio por venta" valor={plata(k.promedio.valor)} variacion={k.promedio.variacion} />
      </div>

      <PanelGrafico titulo="Evolución de ventas" subtitulo="Ventas netas por día y, debajo, cuántas ventas fueron">
        <BarrasVerticales
          datos={datos.evolucion.map((d) => ({ etiqueta: diaCorto(d.dia), valor: d.ventas, detalle: `${d.cantidad} ventas` }))}
          formato={plataCompacta}
          cadaEtiqueta={cada}
          alto={190}
        />
        <p className="mb-1 mt-3 text-xs font-medium text-slate-500 dark:text-[#94a19c]">Cantidad de ventas</p>
        <BarrasVerticales
          datos={datos.evolucion.map((d) => ({ etiqueta: diaCorto(d.dia), valor: d.cantidad }))}
          color={COLOR_CAT(1)}
          formato={(n) => numero(n)}
          cadaEtiqueta={cada}
          alto={70}
        />
      </PanelGrafico>

      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <PanelGrafico titulo="Ventas por día de la semana">
          <BarrasVerticales
            datos={datos.porDiaSemana.map((d) => ({ etiqueta: d.nombre, valor: d.ventas, detalle: `${d.cantidad} ventas` }))}
            formato={plataCompacta}
          />
        </PanelGrafico>
        <PanelGrafico titulo="Ventas por hora" subtitulo="Según la hora en que se abrió cada venta">
          <BarrasVerticales
            datos={horas.map((h) => ({ etiqueta: `${String(h.hora).padStart(2, "0")}h`, valor: h.ventas, detalle: `${h.cantidad} ventas` }))}
            color={COLOR_CAT(1)}
            formato={plataCompacta}
            cadaEtiqueta={horas.length > 14 ? 2 : 1}
          />
        </PanelGrafico>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <PanelGrafico titulo="Medios de pago">
          <BarrasHorizontales datos={datos.medios.map((m) => ({ ...m, color: colorMedio(m.nombre) }))} formato={plata} />
        </PanelGrafico>
        <PanelGrafico titulo="Origen de las ventas">
          <BarrasHorizontales datos={datos.origen.map((o) => ({ ...o, color: COLOR_CAT(ORDEN_ORIGEN.indexOf(o.nombre)) }))} formato={plata} />
        </PanelGrafico>
        <PanelGrafico titulo="Cancelaciones por motivo" subtitulo="Productos anulados, por lo que valían">
          <BarrasHorizontales
            datos={datos.motivos.map((m) => ({ ...m, nombre: ETIQUETA_MOTIVO[m.nombre] ?? m.nombre, color: COLOR_CAT(ORDEN_MOTIVO.indexOf(m.nombre)) }))}
            formato={plata}
          />
        </PanelGrafico>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Tabla
          titulo="Ranking de mozos"
          subtitulo="En mostrador cuenta quien abrió la venta"
          columnas={["#", "Usuario", "Productos", "Ventas"]}
          filas={datos.mozos.map((m, i) => [String(i + 1), m.usuario, numero(m.productos), plata(m.ventas)])}
        />
        <Tabla
          titulo="Historial de cancelaciones"
          subtitulo="Productos anulados después de enviarse a cocina"
          columnas={["#", "Producto", "Usuario", "Cant.", "Monto"]}
          filas={datos.cancelaciones.map((c, i) => [String(i + 1), c.producto, c.usuario, numero(c.cantidad, 2), plata(c.monto)])}
        />
      </div>
    </>
  );
}

function Tabla({ titulo, subtitulo, columnas, filas }: { titulo: string; subtitulo?: string; columnas: string[]; filas: string[][] }) {
  return (
    <Panel>
      <div className="px-4 pt-3.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-500 dark:text-[#94a19c]">{subtitulo}</p>}
      </div>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500 dark:text-[#94a19c]">Sin datos en el período.</p>
      ) : (
        <div className="overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600 dark:bg-[#0d1614] dark:text-[#c1cbc6]">
                {columnas.map((c, i) => (
                  <th key={c} className={`px-3 py-2 ${i >= columnas.length - 2 && i > 1 ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, r) => (
                <tr key={r} className="odd:bg-white even:bg-slate-50/60 dark:odd:bg-transparent dark:even:bg-[#0d1614]">
                  {f.map((celda, i) => (
                    <td key={i} className={`px-3 py-1.5 ${i >= f.length - 2 && i > 1 ? "text-right tabular-nums" : ""} ${i === 0 ? "w-8 text-slate-500" : ""}`}>
                      {celda}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
