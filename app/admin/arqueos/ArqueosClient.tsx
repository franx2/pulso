"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Badge, Card, EmptyState, PageTitle, Spinner } from "@/components/ui";
import { BarraContexto, SelectorLocal } from "@/components/BarraContexto";
import { fechaLarga } from "@/lib/formato";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { rangoDias } from "@/lib/periodo";

type Local = { id: string; nombre: string };
type Arqueo = {
  id: string;
  empleado: string;
  local: string;
  timestamp: string;
  efectivoEsperado: number;
  efectivoContado: number | null;
};

function hora(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArqueosClient() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [localId, setLocalId] = useState("");
  const [arqueos, setArqueos] = useState<Arqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const { desde, hasta } = rangoDias(periodo, hoy);

  useEffect(() => {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, no data lib
    setCargando(true);
    const controlador = new AbortController();
    const params = new URLSearchParams({ desde, hasta, ...(localId ? { localId } : {}) });
    fetch(`/api/arqueos?${params}`, { signal: controlador.signal })
      .then((r) => r.json())
      .then((d) => setArqueos(d.arqueos ?? []))
      .catch(() => {})
      .finally(() => {
        if (!controlador.signal.aborted) setCargando(false);
      });
    return () => controlador.abort();
  }, [localId, desde, hasta]);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle="Efectivo esperado (según Fudo) vs. contado al fichar salida">
        Arqueos de caja
      </PageTitle>

      <BarraContexto
        campos={[
          {
            etiqueta: "Sucursal",
            contenido: locales.length > 1 && (
              <SelectorLocal locales={locales} valor={localId} onChange={setLocalId} todos="Todas" />
            ),
          },
        ]}
        derecha={{ etiqueta: "Período", contenido: <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} /> }}
        pie={{
          alcance: locales.find((l) => l.id === localId)?.nombre ?? "Todas las sucursales",
          detalle: `${fechaLarga(desde)} a ${fechaLarga(hasta)}`,
        }}
      />

      {cargando ? (
        <Spinner />
      ) : arqueos.length === 0 ? (
        <EmptyState>Sin arqueos en este período. Sólo se generan al fichar salida en un local con Fudo configurado.</EmptyState>
      ) : (
        <Card className="divide-y divide-slate-100 p-0">
          {arqueos.map((a) => {
            const diferencia = a.efectivoContado != null ? a.efectivoContado - a.efectivoEsperado : null;
            return (
              <div
                key={a.id}
                className="flex flex-col gap-1 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{a.empleado}</span>
                  <span className="text-xs text-slate-500">{hora(a.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1">
                    <Wallet size={13} />
                    {a.local}
                  </span>
                  <span>
                    Esperado ${a.efectivoEsperado.toFixed(2)} · Contado{" "}
                    {a.efectivoContado != null ? `$${a.efectivoContado.toFixed(2)}` : "—"}
                  </span>
                </div>
                {diferencia != null && Math.abs(diferencia) > 0.01 && (
                  <Badge tone={diferencia < 0 ? "rose" : "amber"}>
                    Diferencia {diferencia > 0 ? "+" : ""}
                    {diferencia.toFixed(2)}
                  </Badge>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
