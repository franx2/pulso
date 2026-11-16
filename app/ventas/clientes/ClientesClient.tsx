"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Contact, Plus, Search } from "lucide-react";
import { Button, ErrorText, Input, Label, PageTitle, Panel, PanelHeader, Textarea, useConfirm } from "@/components/ui";
import { SelectorLocal } from "@/components/BarraContexto";
import { fechaCorta, plata } from "@/lib/formato";
import { aNumero, NavVentas, useLocalVentas } from "../comun";

type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  documento: string | null;
  direccion: string | null;
  descuentoPct: number | null;
  notas: string | null;
  saldo: number;
};
type Ficha = {
  cliente: Cliente;
  ventas: { id: string; numero: number; estado: string; abiertaEn: string; total: number; aCuenta: number }[];
  pagos: { id: string; monto: number; nota: string | null; creadoEn: string }[];
};

async function pedir(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar");
  return data;
}

/**
 * La libreta de clientes: datos para facturar, un descuento propio que se
 * aplica solo al elegirlo en una venta, y la cuenta corriente.
 */
export default function ClientesClient() {
  const [localGuardado, setLocalGuardado] = useLocalVentas();
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState<string | "nuevo" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/ventas/salon${localGuardado ? `?localId=${localGuardado}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setLocales(d.locales ?? []);
        setLocalId(d.localId ?? "");
      })
      .catch(() => setError("No pudimos cargar los locales"));
  }, [localGuardado]);

  const cargar = useCallback(async () => {
    if (!localId) return;
    const d = await pedir(`/api/ventas/clientes?localId=${localId}`, "GET");
    setClientes(d.clientes);
  }, [localId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al elegir el local
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  const q = busqueda.trim().toLowerCase();
  const visibles = (clientes ?? []).filter(
    (c) => !q || c.nombre.toLowerCase().includes(q) || c.telefono?.includes(q) || c.documento?.includes(q)
  );
  const deuda = (clientes ?? []).reduce((s, c) => s + Math.max(0, c.saldo), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        subtitle={clientes ? `${clientes.length} clientes · ${plata(deuda)} en cuentas corrientes` : undefined}
        actions={<NavVentas activo="clientes" />}
      >
        Clientes
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        {locales.length > 1 && (
          <SelectorLocal
            locales={locales}
            valor={localId}
            onChange={(id) => {
              setSel(null);
              setLocalGuardado(id);
            }}
            todos={null}
          />
        )}
        <label className="relative min-w-56 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar cliente</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, teléfono o CUIT" className="pl-9" />
        </label>
        <Button className="ml-auto" onClick={() => setSel("nuevo")}>
          <Plus size={16} aria-hidden />
          Nuevo cliente
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel className="min-w-0 overflow-hidden">
          {clientes === null ? (
            <div className="m-4 h-40 animate-pulse rounded-md bg-slate-100" />
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <Contact size={26} className="text-slate-400" aria-hidden />
              <p className="font-semibold">{clientes.length ? "Ningún cliente coincide." : "Todavía no hay clientes."}</p>
              <p className="text-sm text-slate-500">Se cargan acá, o al abrir una venta escribiendo un nombre nuevo.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-[0.6875rem] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Cliente</th>
                  <th className="hidden px-4 py-2 font-semibold sm:table-cell">Teléfono</th>
                  <th className="hidden px-4 py-2 font-semibold md:table-cell">CUIT / DNI</th>
                  <th className="px-4 py-2 text-right font-semibold">Cuenta corriente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSel(c.id)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${sel === c.id ? "bg-arena-50" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setSel(c.id)} className="text-left font-semibold focus-visible:outline-none focus-visible:underline">
                        {c.nombre}
                      </button>
                      {c.descuentoPct ? <span className="ml-2 text-xs font-semibold text-violet-700">{c.descuentoPct}% off</span> : null}
                    </td>
                    <td className="hidden px-4 py-2.5 text-slate-600 sm:table-cell">{c.telefono ?? "—"}</td>
                    <td className="hidden px-4 py-2.5 text-slate-600 md:table-cell">{c.documento ?? "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${c.saldo > 0.5 ? "text-rose-700" : "text-slate-400"}`}>
                      {c.saldo > 0.5 ? plata(c.saldo) : "al día"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {sel && localId && (
          <FichaCliente
            key={sel}
            localId={localId}
            id={sel === "nuevo" ? null : sel}
            onCerrar={() => setSel(null)}
            onCambio={async (nuevoId) => {
              await cargar();
              if (nuevoId) setSel(nuevoId);
            }}
          />
        )}
      </div>
    </div>
  );
}

function FichaCliente({
  localId,
  id,
  onCerrar,
  onCambio,
}: {
  localId: string;
  id: string | null;
  onCerrar: () => void;
  onCambio: (nuevoId?: string) => Promise<void>;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "", documento: "", direccion: "", descuentoPct: "", notas: "" });
  const [pago, setPago] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();

  const cargar = useCallback(async () => {
    if (!id) return;
    const d: Ficha = await pedir(`/api/ventas/clientes/${id}`, "GET");
    setFicha(d);
    const c = d.cliente;
    setForm({
      nombre: c.nombre,
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      documento: c.documento ?? "",
      direccion: c.direccion ?? "",
      descuentoPct: c.descuentoPct ? String(c.descuentoPct) : "",
      notas: c.notas ?? "",
    });
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch de la ficha al elegir el cliente
    cargar().catch((e: Error) => setError(e.message));
  }, [cargar]);

  async function hacer(accion: () => Promise<unknown>) {
    setOcupado(true);
    setError("");
    try {
      await accion();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const datos = { ...form, descuentoPct: form.descuentoPct ? Number(form.descuentoPct.replace(",", ".")) : null };
    let nuevoId: string | undefined;
    const ok = await hacer(async () => {
      if (id) await pedir(`/api/ventas/clientes/${id}`, "PATCH", datos);
      else nuevoId = (await pedir("/api/ventas/clientes", "POST", { ...datos, localId })).id;
    });
    if (ok) {
      await onCambio(nuevoId);
      if (id) await cargar();
    }
  }

  async function registrarPago(e: React.FormEvent) {
    e.preventDefault();
    const ok = await hacer(() => pedir(`/api/ventas/clientes/${id}/pagos`, "POST", { monto: aNumero(pago) }));
    if (ok) {
      setPago("");
      await Promise.all([cargar(), onCambio()]);
    }
  }

  const campo = (k: keyof typeof form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label>{label}</Label>
      <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} {...extra} />
    </div>
  );

  if (id && !ficha) return <Panel className="h-64 animate-pulse bg-slate-100">{error && <ErrorText>{error}</ErrorText>}</Panel>;
  const saldo = ficha?.cliente.saldo ?? 0;

  return (
    <Panel className="xl:sticky xl:top-20">
      <PanelHeader
        titulo={id ? form.nombre || "Cliente" : "Nuevo cliente"}
        action={
          <button type="button" onClick={onCerrar} className="text-sm font-semibold text-slate-500 underline-offset-2 hover:underline">
            Cerrar
          </button>
        }
      />
      {id && (
        <div className="flex items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <p className="titulo-marca text-[0.6875rem] font-semibold text-slate-500">Cuenta corriente</p>
            <p className={`text-2xl font-bold tabular-nums ${saldo > 0.5 ? "text-rose-700" : ""}`}>{saldo > 0.5 ? `Debe ${plata(saldo)}` : saldo < -0.5 ? `A favor ${plata(-saldo)}` : "Al día"}</p>
          </div>
          <form onSubmit={registrarPago} className="flex items-end gap-2">
            <div className="w-28">
              <Label>Pagó</Label>
              <Input inputMode="decimal" value={pago} onChange={(e) => setPago(e.target.value)} placeholder="$" />
            </div>
            <Button type="submit" variant="ghost" disabled={ocupado || aNumero(pago) <= 0}>
              Registrar
            </Button>
          </form>
        </div>
      )}
      <form onSubmit={guardar} className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2">{campo("nombre", "Nombre", { required: true, autoFocus: !id })}</div>
        {campo("telefono", "Teléfono", { type: "tel" })}
        {campo("documento", "CUIT o DNI", { inputMode: "numeric" })}
        <div className="col-span-2">{campo("email", "Email", { type: "email" })}</div>
        <div className="col-span-2">{campo("direccion", "Dirección")}</div>
        {campo("descuentoPct", "Descuento propio (%)", { inputMode: "decimal", placeholder: "0" })}
        <div className="col-span-2">
          <Label>Notas</Label>
          <Textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className="min-h-16" />
        </div>
        <div className="col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
        {id && (
          <Button
            type="button"
            variant="danger"
            disabled={ocupado}
            onClick={() =>
              confirm({
                title: "Dar de baja al cliente",
                message: "Sale de la libreta; sus ventas lo siguen nombrando.",
                confirmLabel: "Dar de baja",
                tone: "danger",
                onConfirm: async () => {
                  if (await hacer(() => pedir(`/api/ventas/clientes/${id}`, "DELETE"))) {
                    onCerrar();
                    await onCambio();
                  }
                },
              })
            }
          >
            Dar de baja
          </Button>
        )}
        <Button type="submit" disabled={ocupado || !form.nombre.trim()} className={id ? "" : "col-span-2"}>
          {ocupado ? "Guardando…" : id ? "Guardar" : "Crear cliente"}
        </Button>
      </form>

      {ficha && (ficha.ventas.length > 0 || ficha.pagos.length > 0) && (
        <div className="border-t border-slate-100">
          <p className="titulo-marca px-4 pb-1 pt-3 text-[0.6875rem] font-semibold text-slate-500">Movimientos</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {[
              ...ficha.ventas.map((v) => ({ clave: v.id, fecha: v.abiertaEn, venta: v, pago: null })),
              ...ficha.pagos.map((p) => ({ clave: p.id, fecha: p.creadoEn, venta: null, pago: p })),
            ]
              .sort((a, b) => b.fecha.localeCompare(a.fecha))
              .map(({ clave, fecha, venta, pago }) => (
                <li key={clave} className="flex items-baseline gap-3 px-4 py-2">
                  <span className="w-12 shrink-0 text-xs text-slate-500">{fechaCorta(new Date(fecha))}</span>
                  {venta ? (
                    <>
                      <Link href={`/ventas/${venta.id}`} className="min-w-0 flex-1 underline-offset-2 hover:underline">
                        Venta #{venta.numero}
                        {venta.aCuenta > 0 && <span className="text-rose-700"> · {plata(venta.aCuenta)} a cuenta</span>}
                      </Link>
                      <span className="tabular-nums">{plata(venta.total)}</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 text-emerald-700">Pago a cuenta{pago!.nota ? ` · ${pago!.nota}` : ""}</span>
                      <span className="tabular-nums text-emerald-700">−{plata(pago!.monto)}</span>
                    </>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
      {dialog}
    </Panel>
  );
}
