"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Badge, Button, Card, ErrorText, Input, Label, PageTitle, SectionTitle, Select, Spinner } from "@/components/ui";

type Origen = "DEFECTO" | "APRENDIDO" | "MANUAL";
type Coef = { id: string; categoria: string; sector: string; coeficiente: number; origen: Origen; localId: string | null };
type Cap = {
  id: string;
  local: string;
  sector: string;
  capacidadPorEmpleado: number;
  minPersonas: number;
  maxPersonas: number;
  origen: Origen;
  confianza: number;
  observaciones: number;
  matriz: { desde: number; hasta: number | null; personas: number }[];
};
type Ajuste = {
  id: string;
  local: string;
  diaSemana: number | null;
  fecha: string | null;
  valor: number;
  motivo: string | null;
};
type Config = {
  locales: { id: string; nombre: string; tipoLocal: string }[];
  coeficientes: Coef[];
  capacidades: Cap[];
  ajustes: Ajuste[];
  clima: { tipoLocal: string; condicion: string; factor: number; confianza: number; dias: number; origen: Origen }[];
};

const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function BadgeOrigen({ origen }: { origen: Origen }) {
  const tono = origen === "MANUAL" ? "emerald" : origen === "APRENDIDO" ? "slate" : "amber";
  const texto = origen === "MANUAL" ? "manual" : origen === "APRENDIDO" ? "aprendido" : "por defecto";
  return <Badge tone={tono}>{texto}</Badge>;
}

export default function AjustesClient() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [nuevo, setNuevo] = useState({ localId: "", diaSemana: "", fecha: "", valor: "1.00", motivo: "" });

  const cargar = useCallback(async () => {
    const res = await fetch("/api/forecast/config");
    setConfig(res.ok ? await res.json() : null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
  }, [cargar]);

  async function guardar(body: Record<string, unknown>) {
    setError("");
    const res = await fetch("/api/forecast/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar");
      return;
    }
    cargar();
  }

  if (!config) return <Spinner />;

  // Sólo los coeficientes globales: los overrides por local se agregan cuando
  // haga falta y hoy no hay ninguno.
  const globales = config.coeficientes.filter((c) => c.localId === null);
  const categorias = [...new Set(globales.map((c) => c.categoria))];
  const sectores = [...new Set(globales.map((c) => c.sector))];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/pronostico"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-[#94a19c]"
        >
          <ArrowLeft size={14} />
          Volver al pronóstico
        </Link>
        <PageTitle subtitle="Ver cómo piensa el modelo y corregirlo a mano">Ajustes del modelo</PageTitle>
      </div>

      <ErrorText>{error}</ErrorText>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Ajuste manual de demanda (K)</SectionTitle>
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          Multiplica la demanda pronosticada. 1.00 no cambia nada; 1.20 espera 20% más; 0.80 espera
          20% menos. Sirve para lo que el modelo no puede saber: un corte de calle, un evento en el
          barrio, una promoción que arranca el jueves.
        </p>

        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <Label>Local</Label>
            <Select value={nuevo.localId} onChange={(e) => setNuevo({ ...nuevo, localId: e.target.value })}>
              <option value="">Todos</option>
              {config.locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Día de semana</Label>
            <Select value={nuevo.diaSemana} onChange={(e) => setNuevo({ ...nuevo, diaSemana: e.target.value })}>
              <option value="">Cualquiera</option>
              {NOMBRE_DIA.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Fecha puntual</Label>
            <Input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
          </div>
          <div>
            <Label>Factor</Label>
            <Input
              type="number"
              step="0.05"
              min="0.1"
              max="5"
              value={nuevo.valor}
              onChange={(e) => setNuevo({ ...nuevo, valor: e.target.value })}
            />
          </div>
          <div>
            <Label>Motivo</Label>
            <Input
              value={nuevo.motivo}
              onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
              placeholder="Ej: evento en la plaza"
            />
          </div>
        </div>
        <Button
          type="button"
          className="self-start"
          onClick={() =>
            guardar({
              tipo: "ajusteK",
              localId: nuevo.localId || null,
              diaSemana: nuevo.diaSemana === "" ? null : Number(nuevo.diaSemana),
              fecha: nuevo.fecha || null,
              valor: Number(nuevo.valor),
              motivo: nuevo.motivo || null,
            })
          }
        >
          Agregar ajuste
        </Button>

        {config.ajustes.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-[#74817b]">
            Sin ajustes manuales: el pronóstico va tal cual lo calcula el modelo.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {config.ajustes.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2.5 text-sm dark:border-[#1c2521]">
                <span>
                  <strong className="tabular-nums">×{a.valor.toFixed(2)}</strong> · {a.local}
                  {a.diaSemana != null && ` · ${NOMBRE_DIA[a.diaSemana]}`}
                  {a.fecha && ` · ${a.fecha}`}
                  {a.motivo && <span className="ml-1 text-slate-400 dark:text-[#74817b]">({a.motivo})</span>}
                </span>
                <button
                  type="button"
                  onClick={() => guardar({ tipo: "borrarAjusteK", id: a.id })}
                  aria-label="Quitar ajuste"
                  className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Capacidad por sector</SectionTitle>
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          Cuánta carga por hora sostiene una persona. Es el número que convierte demanda en
          dotación: si está mal, la dotación está mal. La tabla de rangos se deriva de acá, no se
          configura aparte.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                <th className="py-2 pr-3 font-semibold">Local</th>
                <th className="py-2 pr-3 font-semibold">Sector</th>
                <th className="py-2 pr-3 text-right font-semibold">Carga/hora por persona</th>
                <th className="py-2 pr-3 font-semibold">Origen</th>
                <th className="py-2 font-semibold">Se traduce en</th>
              </tr>
            </thead>
            <tbody>
              {config.capacidades.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                  <td className="py-2 pr-3">{c.local}</td>
                  <td className="py-2 pr-3 font-medium">{c.sector.toLowerCase()}</td>
                  <td className="py-2 pr-3 text-right">
                    <Input
                      type="number"
                      min="1"
                      step="5"
                      defaultValue={c.capacidadPorEmpleado}
                      className="w-auto! py-1 text-right text-sm"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v > 0 && v !== c.capacidadPorEmpleado) guardar({ tipo: "capacidad", id: c.id, valor: v });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <BadgeOrigen origen={c.origen} />
                    {c.observaciones > 0 && (
                      <span className="ml-1 text-xs text-slate-400 dark:text-[#74817b]">{c.observaciones} obs.</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-slate-500 dark:text-[#94a19c]">
                    {c.matriz
                      .slice(0, 3)
                      .map((m) => `${m.desde}-${m.hasta ?? "+"} → ${m.personas}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle>Matriz categoría × sector</SectionTitle>
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          Cuánta carga genera una unidad vendida de cada categoría en cada sector. Los valores
          arrancan por defecto y se corrigen a mano; el que toques queda marcado como manual y el
          modelo deja de pisarlo.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                <th className="py-2 pr-3 font-semibold">Categoría</th>
                {sectores.map((s) => (
                  <th key={s} className="py-2 pr-3 text-right font-semibold">
                    {s.toLowerCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat) => (
                <tr key={cat} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                  <td className="py-2 pr-3 font-medium">{cat}</td>
                  {sectores.map((sec) => {
                    const c = globales.find((x) => x.categoria === cat && x.sector === sec);
                    if (!c) return <td key={sec} className="py-2 pr-3 text-right text-slate-300">—</td>;
                    return (
                      <td key={sec} className="py-2 pr-3 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          defaultValue={c.coeficiente}
                          className={`w-auto! py-1 text-right text-sm ${
                            c.origen === "MANUAL" ? "border-emerald-400 dark:border-[#37e6b0]" : ""
                          }`}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v >= 0 && v !== c.coeficiente) guardar({ tipo: "coeficiente", id: c.id, valor: v });
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <SectionTitle>Sensibilidad al clima</SectionTitle>
        {config.clima.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">
            Todavía sin medir. Se calcula comparando días con y sin cada condición, contra el mismo
            día de semana, y necesita historia suficiente. Mientras tanto el clima no mueve el
            pronóstico en vez de moverlo con un número inventado.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {config.clima.map((c) => (
              <li key={`${c.tipoLocal}-${c.condicion}`} className="flex items-center justify-between gap-2">
                <span>
                  {c.tipoLocal === "INDOOR_MALL" ? "En shopping" : "A la calle"} ·{" "}
                  {c.condicion.toLowerCase()}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">×{c.factor.toFixed(2)}</span>
                  <span className="text-xs text-slate-400 dark:text-[#74817b]">
                    {c.dias} días · confianza {(c.confianza * 100).toFixed(0)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
