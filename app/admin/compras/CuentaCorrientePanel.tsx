"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Input, Label, Panel } from "@/components/ui";
import { plata, fechaCorta } from "@/lib/formato";
import { hoyAR } from "@/lib/fechaAR";

/**
 * Cuenta corriente con la fábrica, por local.
 *
 * El saldo nunca se guarda: sale siempre de sumar el saldo inicial que carga
 * el usuario, los remitos (que ya llegan solos por mail) y los pagos (que se
 * cargan acá). Si un remito viejo se corrige, el saldo del día siguiente ya
 * lo refleja sin que nadie tenga que tocar un número aparte.
 */

type Movimiento = {
  fecha: string;
  tipo: "SALDO_INICIAL" | "REMITO" | "PAGO";
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
  pagoId?: string;
};

type CuentaLocal = {
  localId: string;
  local: string;
  saldoInicial: number;
  fechaInicial: string | null;
  movimientos: Movimiento[];
  totalRemitos: number;
  totalPagos: number;
  saldo: number;
};

type Respuesta = {
  locales: { id: string; nombre: string }[];
  porLocal: CuentaLocal[];
  saldoCadena: number;
};

export default function CuentaCorrientePanel({
  localId,
  setLocalId,
}: {
  localId: string;
  setLocalId: (id: string) => void;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();
    fetch("/api/cuenta-corriente", { signal: controlador.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fallo"))))
      .then(setDatos)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError("No pudimos cargar la cuenta corriente.");
        }
      });
    return () => controlador.abort();
  }, [revision]);

  if (error) return <p className="text-sm text-slate-500 dark:text-[#94a19c]">{error}</p>;
  if (!datos) {
    return <div className="h-64 animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#172724]" aria-label="Cargando" />;
  }

  const actual = localId ? datos.porLocal.find((l) => l.localId === localId) : null;

  return (
    <div className="space-y-5">
      <Panel>
        <div className="border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <h2 className="font-semibold">Saldo por sucursal</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
            Con Bianconero. Incluye mercadería y royalty: es la misma empresa, la misma deuda.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-[#1c2521]">
          {datos.porLocal.map((l) => (
            <button
              key={l.localId}
              type="button"
              onClick={() => setLocalId(l.localId === localId ? "" : l.localId)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#172724] ${
                l.localId === localId ? "bg-emerald-50/60 dark:bg-[#122620]" : ""
              }`}
            >
              <span className="font-medium">{l.local}</span>
              <span
                className={`font-semibold tabular-nums ${
                  l.saldo > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : l.saldo < 0
                      ? "text-emerald-700 dark:text-[#4ee6b0]"
                      : "text-slate-400"
                }`}
              >
                {plata(l.saldo)}
              </span>
            </button>
          ))}
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 font-semibold dark:bg-[#0d1614]">
            <span>Total cadena</span>
            <span className="tabular-nums">{plata(datos.saldoCadena)}</span>
          </div>
        </div>
      </Panel>

      {!actual ? (
        <EmptyState>Elegí una sucursal arriba para ver el detalle de su cuenta.</EmptyState>
      ) : (
        <DetalleLocal cuenta={actual} onCambio={() => setRevision((v) => v + 1)} />
      )}
    </div>
  );
}

function DetalleLocal({ cuenta, onCambio }: { cuenta: CuentaLocal; onCambio: () => void }) {
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoForm, setSaldoForm] = useState(String(cuenta.saldoInicial || ""));
  const [fechaForm, setFechaForm] = useState(cuenta.fechaInicial ?? "");
  const [guardandoSaldo, setGuardandoSaldo] = useState(false);
  const [errorSaldo, setErrorSaldo] = useState("");

  const [mostrarForm, setMostrarForm] = useState(false);
  const [fecha, setFecha] = useState(hoyAR());
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState("");
  const [nota, setNota] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [errorPago, setErrorPago] = useState("");

  async function guardarSaldoInicial(e: React.FormEvent) {
    e.preventDefault();
    setErrorSaldo("");
    if (saldoForm.trim() && !fechaForm) {
      setErrorSaldo("Si cargás un monto, elegí la fecha de corte.");
      return;
    }
    setGuardandoSaldo(true);
    const res = await fetch(`/api/locales/${cuenta.localId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saldoInicialProveedor: Number(saldoForm) || 0,
        saldoInicialProveedorFecha: fechaForm || null,
      }),
    });
    setGuardandoSaldo(false);
    if (!res.ok) {
      setErrorSaldo("No se pudo guardar.");
      return;
    }
    setEditandoSaldo(false);
    onCambio();
  }

  async function agregarPago(e: React.FormEvent) {
    e.preventDefault();
    setErrorPago("");
    const montoNum = Number(monto);
    if (!fecha || !montoNum || montoNum <= 0) {
      setErrorPago("Cargá una fecha y un monto mayor a cero.");
      return;
    }
    setGuardandoPago(true);
    const res = await fetch(`/api/locales/${cuenta.localId}/pagos-proveedor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, monto: montoNum, medio: medio || undefined, nota: nota || undefined }),
    });
    setGuardandoPago(false);
    if (!res.ok) {
      setErrorPago("No se pudo guardar el pago.");
      return;
    }
    setMonto("");
    setMedio("");
    setNota("");
    setMostrarForm(false);
    onCambio();
  }

  async function borrarPago(id: string) {
    await fetch(`/api/pagos-proveedor/${id}`, { method: "DELETE" });
    onCambio();
  }

  return (
    <>
      <section className="grid grid-cols-2 divide-x divide-y border-y border-slate-200 sm:grid-cols-4 sm:divide-y-0 dark:divide-[#29403b] dark:border-[#29403b]">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">Saldo actual</p>
          <p
            className={`mt-1 text-xl font-bold tabular-nums md:text-2xl ${
              cuenta.saldo > 0
                ? "text-rose-600 dark:text-rose-400"
                : cuenta.saldo < 0
                  ? "text-emerald-700 dark:text-[#4ee6b0]"
                  : "text-slate-950 dark:text-[#f2f7f4]"
            }`}
          >
            {plata(cuenta.saldo)}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">
            {cuenta.saldo > 0 ? "le debemos a la fábrica" : cuenta.saldo < 0 ? "a favor nuestro" : "al día"}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">Saldo inicial</p>
          <p className="mt-1 text-xl font-bold tabular-nums md:text-2xl">{plata(cuenta.saldoInicial)}</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">
            {cuenta.fechaInicial ? `al ${fechaCorta(cuenta.fechaInicial)}` : "sin fecha de corte"}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">Remitos posteriores</p>
          <p className="mt-1 text-xl font-bold tabular-nums md:text-2xl">{plata(cuenta.totalRemitos)}</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">mercadería y royalty</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">Pagos cargados</p>
          <p className="mt-1 text-xl font-bold tabular-nums md:text-2xl">{plata(cuenta.totalPagos)}</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-[#74817b]">
            {cuenta.movimientos.filter((m) => m.tipo === "PAGO").length} pagos
          </p>
        </div>
      </section>

      {!cuenta.fechaInicial && cuenta.movimientos.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          No hay saldo inicial cargado: el saldo de abajo sólo cuenta los remitos que ya están en
          el sistema, no lo que se debía antes.
        </p>
      )}

      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Saldo inicial</h2>
          <Button type="button" variant="ghost" onClick={() => setEditandoSaldo((v) => !v)}>
            <Pencil size={14} />
            {editandoSaldo ? "Cancelar" : "Editar"}
          </Button>
        </div>
        {editandoSaldo && (
          <form onSubmit={guardarSaldoInicial} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Label>Lo que se debía</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={saldoForm}
                onChange={(e) => setSaldoForm(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="w-40">
              <Label>A esta fecha</Label>
              <Input type="date" value={fechaForm} onChange={(e) => setFechaForm(e.target.value)} max={hoyAR()} />
            </div>
            <Button type="submit" disabled={guardandoSaldo}>
              {guardandoSaldo ? "Guardando…" : "Guardar"}
            </Button>
            {errorSaldo && <p className="w-full text-sm text-rose-600 dark:text-rose-400">{errorSaldo}</p>}
          </form>
        )}
        <p className="mt-2 text-xs text-slate-500 dark:text-[#94a19c]">
          Lo que este local le debía a la fábrica antes de empezar a llevar la cuenta acá. Los
          remitos y pagos posteriores a esta fecha se suman solos.
        </p>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
          <h2 className="font-semibold">Movimientos</h2>
          <Button type="button" onClick={() => setMostrarForm((v) => !v)}>
            <Plus size={16} />
            Cargar pago
          </Button>
        </div>

        {mostrarForm && (
          <form onSubmit={agregarPago} className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
            <div className="w-36">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={hoyAR()} required />
            </div>
            <div className="w-36">
              <Label>Monto</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="w-40">
              <Label>Medio (opcional)</Label>
              <Input value={medio} onChange={(e) => setMedio(e.target.value)} placeholder="Transferencia" />
            </div>
            <div className="min-w-40 flex-1">
              <Label>Nota (opcional)</Label>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
            </div>
            <Button type="submit" disabled={guardandoPago}>
              {guardandoPago ? "Guardando…" : "Cargar"}
            </Button>
            {errorPago && <p className="w-full text-sm text-rose-600 dark:text-rose-400">{errorPago}</p>}
          </form>
        )}

        {cuenta.movimientos.length === 0 ? (
          <EmptyState>Sin movimientos todavía.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                  <th className="px-4 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Movimiento</th>
                  <th className="px-3 py-2 text-right font-semibold">Debe</th>
                  <th className="px-3 py-2 text-right font-semibold">Haber</th>
                  <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1c2521]">
                {cuenta.movimientos.map((m, i) => (
                  <tr key={`${m.tipo}-${m.fecha}-${i}`}>
                    <td className="px-4 py-2 tabular-nums text-slate-500 dark:text-[#94a19c]">
                      {fechaCorta(m.fecha)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{m.descripcion}</span>
                      {m.tipo === "SALDO_INICIAL" && (
                        <span className="ml-2 inline-block">
                          <Badge tone="slate">corte</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.debe > 0 ? plata(m.debe) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-[#4ee6b0]">
                      {m.haber > 0 ? plata(m.haber) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{plata(m.saldo)}</td>
                    <td className="px-4 py-2 text-right">
                      {m.pagoId && (
                        <button
                          type="button"
                          onClick={() => borrarPago(m.pagoId!)}
                          title="Borrar este pago"
                          aria-label="Borrar este pago"
                          className="text-slate-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
