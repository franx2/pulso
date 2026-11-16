"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock } from "lucide-react";
import { Button, ErrorText, Input, Label, Metrica, PageTitle, Panel, PanelHeader, SelectorSegmentado } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { plata } from "@/lib/formato";
import { aNumero as num, NavVentas, useLocalVentas } from "../comun";

type Caja = {
  id: string;
  nombre: string;
  abiertaEn: string;
  fondoInicial: number;
  ventasEnCurso: number;
  vendido: number;
  propinas: number;
  porMedio: { medio: string; monto: number }[];
  ingresos: number;
  egresos: number;
  efectivoEsperado: number | null;
  movimientos: { id: string; tipo: "INGRESO" | "EGRESO"; monto: number; motivo: string; createdAt: string; empleado: string }[];
  ventas: { id: string; numero: number; total: number | null; cerradaEn: string | null; tipo: string; mesa: number | null }[];
};
type Cerrada = {
  id: string;
  nombre: string;
  abiertaEn: string;
  cerradaEn: string;
  abiertaPor: string;
  cerradaPor: string | null;
  fondoInicial: number;
  efectivoContado: number | null;
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const diaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function pedir(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

export default function CajaClient() {
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [datos, setDatos] = useState<{ abierta: Caja | null; cerradas: Cerrada[]; permisos: Record<string, boolean> } | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [fondo, setFondo] = useState("");
  const [contado, setContado] = useState("");
  const [mov, setMov] = useState<{ tipo: "EGRESO" | "INGRESO"; monto: string; motivo: string }>({ tipo: "EGRESO", monto: "", motivo: "" });

  const cargar = useCallback(async () => {
    // El salón resuelve qué local corresponde; la caja usa el mismo.
    const salon = await pedir(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`, "GET");
    setLocales(salon.locales);
    setLocalId(salon.localId ?? "");
    if (!salon.localId) return setDatos({ abierta: null, cerradas: [], permisos: salon.permisos });
    setDatos(await pedir(`/api/ventas/caja?localId=${salon.localId}`, "GET"));
  }, [localGuardado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, sin librería de datos
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  async function hacer(accion: () => Promise<unknown>) {
    setOcupado(true);
    setError("");
    try {
      await accion();
      await cargar();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  if (!datos) return error ? <ErrorText>{error}</ErrorText> : <div className="h-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando la caja" />;
  const { abierta, cerradas, permisos } = datos;
  const diferencia = abierta?.efectivoEsperado != null && contado ? num(contado) - abierta.efectivoEsperado : null;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle={abierta ? `${abierta.nombre} abierta desde las ${hora(abierta.abiertaEn)}` : "No hay caja abierta"} actions={<NavVentas activo="caja" />}>
        Caja
      </PageTitle>

      {locales.length > 1 && <SelectorLocal locales={locales} valor={localId} onChange={setLocalGuardado} todos={null} />}
      <ErrorText>{error}</ErrorText>

      {!abierta ? (
        <Panel className="max-w-md">
          <PanelHeader titulo="Abrir la caja" descripcion="Contá el efectivo con el que arranca el cajón. Las ventas que se cobren desde ahora quedan en esta caja." />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void hacer(() => pedir("/api/ventas/caja", "POST", { localId, fondoInicial: num(fondo) })).then((ok) => ok && setFondo(""));
            }}
            className="flex flex-col gap-3 p-4"
          >
            <div>
              <Label>Fondo inicial en efectivo</Label>
              <Input inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} placeholder="0" className="text-lg font-semibold tabular-nums" />
            </div>
            <Button type="submit" disabled={ocupado || !permisos.create_cash_counts}>
              <Unlock size={16} aria-hidden />
              Abrir caja
            </Button>
            {!permisos.create_cash_counts && <p className="text-xs text-slate-500 dark:text-[#94a19c]">Tu rol no puede abrir la caja.</p>}
          </form>
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="grid grid-cols-2 divide-slate-100 px-4 md:grid-cols-4 md:divide-x dark:divide-[#1c2521]">
              <Metrica label="Vendido" valor={plata(abierta.vendido)} nota={abierta.ventas.length === 1 ? "1 venta cerrada" : `${abierta.ventas.length} ventas cerradas`} />
              <Metrica label="Propinas" valor={plata(abierta.propinas)} />
              <Metrica label="Fondo inicial" valor={plata(abierta.fondoInicial)} />
              <Metrica
                label="Efectivo que tiene que haber"
                valor={abierta.efectivoEsperado != null ? plata(abierta.efectivoEsperado) : "—"}
                nota={abierta.efectivoEsperado == null ? "tu rol no lo ve" : "fondo + efectivo + ingresos − retiros"}
              />
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader titulo="Por medio de pago" />
              {abierta.porMedio.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500 dark:text-[#94a19c]">Todavía no se cobró nada.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {abierta.porMedio.map((m) => (
                    <li key={m.medio} className="flex justify-between px-4 py-2.5 text-sm">
                      <span>{m.medio}</span>
                      <span className="font-semibold tabular-nums">{plata(m.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader titulo="Retiros e ingresos" descripcion="Plata que sale o entra sin ser una venta: un pago al proveedor, un cambio." />
              {permisos.create_cash_movements && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void hacer(() => pedir(`/api/ventas/caja/${abierta.id}/movimientos`, "POST", { tipo: mov.tipo, monto: num(mov.monto), motivo: mov.motivo })).then(
                      (ok) => ok && setMov({ tipo: mov.tipo, monto: "", motivo: "" })
                    );
                  }}
                  className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-4 dark:border-[#1c2521]"
                >
                  <SelectorSegmentado
                    label="Tipo de movimiento"
                    valor={mov.tipo}
                    onChange={(tipo) => setMov({ ...mov, tipo })}
                    opciones={[
                      { clave: "EGRESO", label: "Retiro" },
                      { clave: "INGRESO", label: "Ingreso" },
                    ]}
                  />
                  <div className="w-28">
                    <Label>Monto</Label>
                    <Input inputMode="decimal" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value })} />
                  </div>
                  <div className="min-w-[10rem] flex-1">
                    <Label>Motivo</Label>
                    <Input value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} placeholder="Hielo" />
                  </div>
                  <Button type="submit" variant="ghost" disabled={ocupado || !mov.monto || !mov.motivo.trim()}>
                    Registrar
                  </Button>
                </form>
              )}
              {abierta.movimientos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500 dark:text-[#94a19c]">Sin movimientos.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                  {abierta.movimientos.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {m.tipo === "EGRESO" ? (
                        <ArrowUpCircle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" aria-label="Retiro" />
                      ) : (
                        <ArrowDownCircle size={16} className="shrink-0 text-emerald-700 dark:text-[#4ee6b0]" aria-label="Ingreso" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {m.motivo} <span className="text-slate-500 dark:text-[#94a19c]">· {m.empleado} · {hora(m.createdAt)}</span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {m.tipo === "EGRESO" ? "−" : ""}
                        {plata(m.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHeader titulo="Ventas de esta caja" />
            {abierta.ventas.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 dark:text-[#94a19c]">Todavía no se cerró ninguna venta.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                {abierta.ventas.map((v) => (
                  <li key={v.id}>
                    <Link href={`/ventas/${v.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-[#172724]">
                      <span>
                        #{v.numero} · {v.mesa ? `Mesa ${v.mesa}` : "Mostrador"}
                        <span className="text-slate-500 dark:text-[#94a19c]"> · {v.cerradaEn ? hora(v.cerradaEn) : ""}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{plata(v.total ?? 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="max-w-md">
            <PanelHeader
              titulo="Cerrar la caja"
              descripcion={abierta.ventasEnCurso > 0 ? `Hay ${abierta.ventasEnCurso} ventas abiertas: cobralas o anulalas antes de cerrar.` : "Contá el efectivo del cajón y cargalo."}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void hacer(() => pedir(`/api/ventas/caja/${abierta.id}/cerrar`, "POST", { efectivoContado: num(contado) })).then((ok) => ok && setContado(""));
              }}
              className="flex flex-col gap-3 p-4"
            >
              <div>
                <Label>Efectivo contado</Label>
                <Input inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} className="text-lg font-semibold tabular-nums" />
              </div>
              {diferencia != null && (
                <p className={`text-sm font-semibold ${Math.abs(diferencia) < 1 ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-700 dark:text-rose-300"}`}>
                  {Math.abs(diferencia) < 1 ? "Cierra justo" : diferencia > 0 ? `Sobran ${plata(diferencia)}` : `Faltan ${plata(-diferencia)}`}
                </p>
              )}
              <Button type="submit" disabled={ocupado || !contado || abierta.ventasEnCurso > 0 || !permisos.create_cash_counts}>
                <Lock size={16} aria-hidden />
                Cerrar caja
              </Button>
            </form>
          </Panel>
        </>
      )}

      {cerradas.length > 0 && (
        <Panel>
          <PanelHeader titulo="Cajas anteriores" />
          <ul className="divide-y divide-slate-100 dark:divide-[#1c2521]">
            {cerradas.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  {c.nombre} · {diaHora(c.abiertaEn)} a {hora(c.cerradaEn)}
                  <span className="text-slate-500 dark:text-[#94a19c]"> · cerró {c.cerradaPor ?? "—"}</span>
                </span>
                <span className="tabular-nums">contado {c.efectivoContado != null ? plata(c.efectivoContado) : "—"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
