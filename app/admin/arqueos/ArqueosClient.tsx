"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Badge, Card, EmptyState, Label, PageTitle, Select, Spinner } from "@/components/ui";

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

  useEffect(() => {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, no data lib
    setCargando(true);
    const params = new URLSearchParams(localId ? { localId } : {});
    fetch(`/api/arqueos?${params}`)
      .then((r) => r.json())
      .then((d) => setArqueos(d.arqueos ?? []))
      .finally(() => setCargando(false));
  }, [localId]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle subtitle="Efectivo esperado (según Fudo) vs. contado al fichar salida, últimos 7 días">
        Arqueos de caja
      </PageTitle>

      {locales.length > 1 && (
        <Card>
          <Label>Sucursal</Label>
          <Select value={localId} onChange={(e) => setLocalId(e.target.value)}>
            <option value="">Todas</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </Select>
        </Card>
      )}

      {cargando ? (
        <Spinner />
      ) : arqueos.length === 0 ? (
        <EmptyState>Sin arqueos en este período. Sólo se generan al fichar salida en un local con Fudo configurado.</EmptyState>
      ) : (
        <Card className="flex flex-col gap-2">
          {arqueos.map((a) => {
            const diferencia = a.efectivoContado != null ? a.efectivoContado - a.efectivoEsperado : null;
            return (
              <div
                key={a.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-100 p-3 text-sm dark:border-[#1c2521]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{a.empleado}</span>
                  <span className="text-xs text-slate-400 dark:text-[#74817b]">{hora(a.timestamp)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-[#c1cbc6]">
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
