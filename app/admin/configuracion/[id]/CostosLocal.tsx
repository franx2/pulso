"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { mesLargo, plata } from "@/lib/formato";
import { hoyAR } from "@/lib/fechaAR";

type Concepto = { concepto: string; monto: number; nota: string | null; cargado: boolean };
type Comisiones = {
  comisionCredito: number;
  comisionDebito: number;
  comisionBilletera: number;
  comisionDelivery: number;
};

const CAMPOS: { clave: keyof Comisiones; label: string; ayuda: string }[] = [
  { clave: "comisionCredito", label: "Tarjeta de crédito", ayuda: "Sobre el monto liquidado" },
  { clave: "comisionDebito", label: "Tarjeta de débito", ayuda: "Incluye prepagas" },
  { clave: "comisionBilletera", label: "Mercado Pago y QR", ayuda: "Billeteras, QR, posnet" },
  { clave: "comisionDelivery", label: "Delivery (PedidosYa, Uber)", ayuda: "La más cara con diferencia" },
];

const mesActual = () => hoyAR().slice(0, 7);

export default function CostosLocal({ localId }: { localId: string }) {
  const [comisiones, setComisiones] = useState<Comisiones | null>(null);
  const [mes, setMes] = useState(mesActual());
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/locales/${localId}`)
      .then((r) => (r.ok ? r.json() : null))
      // La respuesta viene envuelta en `{ local }`. Leído plano, cada campo
      // daba undefined y la pantalla mostraba SIEMPRE los valores por defecto:
      // se guardaba 3% de débito, se volvía a entrar y decía 2% otra vez.
      .then((d) => d?.local && setComisiones({
        comisionCredito: d.local.comisionCredito,
        comisionDebito: d.local.comisionDebito,
        comisionBilletera: d.local.comisionBilletera,
        comisionDelivery: d.local.comisionDelivery,
      }))
      .catch(() => setAviso({ texto: "No pudimos cargar las comisiones.", ok: false }));
  }, [localId]);

  useEffect(() => {
    fetch(`/api/locales/${localId}/costos?mes=${mes}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConceptos(d.conceptos))
      .catch(() => setAviso({ texto: "No pudimos cargar los costos del mes.", ok: false }));
  }, [localId, mes]);

  async function guardarComisiones() {
    if (!comisiones) return;
    setGuardando(true);
    setAviso(null);
    const res = await fetch(`/api/locales/${localId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(comisiones),
    });
    setGuardando(false);
    setAviso(res.ok ? { texto: "Comisiones guardadas.", ok: true } : { texto: "No se pudieron guardar.", ok: false });
  }

  async function guardarCostos() {
    setGuardando(true);
    setAviso(null);
    const res = await fetch(`/api/locales/${localId}/costos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, conceptos }),
    });
    setGuardando(false);
    setAviso(res.ok ? { texto: `Costos de ${mesLargo(mes)} guardados.`, ok: true } : { texto: "No se pudieron guardar.", ok: false });
  }

  const total = conceptos.reduce((s, c) => s + c.monto, 0);
  const faltan = conceptos.filter((c) => c.monto === 0).length;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold">Comisiones por medio de pago</h3>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
          Se aplican sobre lo cobrado por cada medio. Son por local porque cada sucursal negocia
          sus propios contratos.
        </p>
        {comisiones && (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CAMPOS.map((campo) => (
                <div key={campo.clave}>
                  <Label>{campo.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={(comisiones[campo.clave] * 100).toFixed(1)}
                      onChange={(e) =>
                        setComisiones({ ...comisiones, [campo.clave]: Number(e.target.value) / 100 })
                      }
                    />
                    <span className="text-sm text-slate-500 dark:text-[#94a19c]">%</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-[#74817b]">{campo.ayuda}</p>
                </div>
              ))}
            </div>
            <Button type="button" className="mt-3" disabled={guardando} onClick={guardarComisiones}>
              Guardar comisiones
            </Button>
          </>
        )}
      </section>

      <section className="border-t border-slate-100 pt-5 dark:border-[#1c2521]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Costos fijos del mes</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
              No están en Fudo ni en los remitos: sin esto el resultado se queda en margen de
              contribución. Dejar un concepto en cero lo marca como pendiente.
            </p>
          </div>
          <div className="w-40">
            <Label>Mes</Label>
            <Input type="month" max={mesActual()} value={mes} onChange={(e) => setMes(e.target.value)} />
          </div>
        </div>

        <div className="mt-3 divide-y divide-slate-100 dark:divide-[#1c2521]">
          {conceptos.map((c, i) => (
            <div key={c.concepto} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-32 font-medium">{c.concepto}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-500 dark:text-[#94a19c]">$</span>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  className="w-36"
                  value={c.monto || ""}
                  placeholder="0"
                  onChange={(e) => {
                    const copia = [...conceptos];
                    copia[i] = { ...c, monto: Number(e.target.value) || 0 };
                    setConceptos(copia);
                  }}
                />
              </div>
              <Input
                className="min-w-0 flex-1"
                placeholder="Nota (opcional)"
                value={c.nota ?? ""}
                onChange={(e) => {
                  const copia = [...conceptos];
                  copia[i] = { ...c, nota: e.target.value };
                  setConceptos(copia);
                }}
              />
              {c.monto === 0 && (
                <span className="text-xs text-amber-700 dark:text-amber-300">sin cargar</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={guardando} onClick={guardarCostos}>
            Guardar costos de {mesLargo(mes)}
          </Button>
          <span className="text-sm text-slate-500 dark:text-[#94a19c]">
            Total {plata(total)}
            {faltan > 0 && ` · ${faltan} sin cargar`}
          </span>
        </div>
      </section>

      {aviso && (
        <p
          role="status"
          className={`text-sm font-medium ${
            aviso.ok ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
