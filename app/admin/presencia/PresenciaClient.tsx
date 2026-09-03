"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleSlash,
  Coffee,
  FileText,
  LogIn,
  LogOut,
  Palmtree,
  PencilLine,
  RefreshCw,
  ScanFace,
  X,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, Select, SectionTitle, Spinner } from "@/components/ui";
import { formatearFechaSql } from "@/lib/fechas";

type Local = { id: string; nombre: string };

type Estado = "TRABAJANDO" | "EN_DESCANSO" | "TERMINO" | "FALTA" | "AUSENTE" | "SIN_TURNO";

type Fila = {
  empleadoId: string;
  nombre: string;
  local: string;
  estado: Estado;
  entrada: string | null;
  salida: string | null;
  horasTrabajadas: number;
  minutosTarde: number;
  turno: { horaInicio: string; horaFin: string } | null;
  ausencia: string | null;
};

type Alerta = { id: string; tipo: string; detalle: string; empleado: string };

type Correccion = {
  id: string;
  empleado: string;
  tipo: string;
  tipoFichaje: string | null;
  fechaHora: string | null;
  motivo: string;
  actual: { tipo: string; timestamp: string } | null;
};

type Ausencia = {
  id: string;
  empleado: string;
  tipo: string;
  desde: string;
  hasta: string;
  motivo: string | null;
  tieneCertificado: boolean;
};

type RostroDudoso = {
  id: string;
  empleado: string;
  tipo: string;
  timestamp: string;
  rostro: "NO_COINCIDE" | "SIN_ROSTRO" | "NO_REGISTRADO";
  distancia: number | null;
  tieneFoto: boolean;
};

const MOTIVO_ROSTRO: Record<RostroDudoso["rostro"], string> = {
  NO_COINCIDE: "La cara no coincide con la registrada",
  SIN_ROSTRO: "La cámara no detectó ninguna cara",
  NO_REGISTRADO: "Todavía no registró su rostro",
};

const ETIQUETA_ALERTA: Record<string, string> = {
  NO_FICHO: "No fichó",
  LLEGADA_TARDE: "Llegada tarde",
  SALIDA_OLVIDADA: "Salida olvidada",
  EXCESO_HORARIO: "Exceso de horario",
};

const ETIQUETA_FICHAJE: Record<string, string> = {
  ENTRADA: "entrada",
  SALIDA: "salida",
  DESCANSO_INICIO: "inicio de descanso",
  DESCANSO_FIN: "fin de descanso",
};

const ETIQUETA_AUSENCIA: Record<string, string> = {
  VACACIONES: "Vacaciones",
  ENFERMEDAD: "Enfermedad",
  FRANCO: "Franco",
  LICENCIA: "Licencia",
  FALTA: "Falta",
  OTRO: "Otro",
};

const GRUPOS: { estado: Estado; titulo: string; Icono: typeof LogIn; tono: string }[] = [
  { estado: "TRABAJANDO", titulo: "Trabajando", Icono: LogIn, tono: "text-emerald-600 dark:text-[#4ee6b0]" },
  { estado: "EN_DESCANSO", titulo: "En descanso", Icono: Coffee, tono: "text-amber-600 dark:text-amber-400" },
  { estado: "FALTA", titulo: "Sin fichar", Icono: AlertTriangle, tono: "text-red-600 dark:text-red-400" },
  { estado: "AUSENTE", titulo: "De licencia", Icono: Palmtree, tono: "text-sky-600 dark:text-sky-400" },
  { estado: "TERMINO", titulo: "Jornada terminada", Icono: LogOut, tono: "text-slate-500" },
  { estado: "SIN_TURNO", titulo: "Sin turno hoy", Icono: CircleSlash, tono: "text-slate-400" },
];

const REFRESCO_MS = 30_000;

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—";
/** Instante real (un fichaje): hora local. */
const diaLocal = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });

export default function PresenciaClient() {
  const [locales, setLocales] = useState<Local[]>([]);
  const [localId, setLocalId] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [correcciones, setCorrecciones] = useState<Correccion[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [rostros, setRostros] = useState<RostroDudoso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargar = useCallback(async (local: string) => {
    const params = local ? `?localId=${local}` : "";
    const res = await fetch(`/api/presencia${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setFilas(data.filas ?? []);
    setAlertas(data.alertas ?? []);
    setCorrecciones(data.correcciones ?? []);
    setAusencias(data.ausencias ?? []);
    setRostros(data.rostrosDudosos ?? []);
    setActualizado(new Date());
    setCargando(false);
  }, []);

  useEffect(() => {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar(localId);
    const id = setInterval(() => cargar(localId), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar, localId]);

  async function resolverAlerta(id: string) {
    setAlertas((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/alertas/${id}`, { method: "PATCH" });
  }

  async function resolver(recurso: "correcciones" | "ausencias", id: string, aprobar: boolean) {
    let comentario: string | undefined;
    if (!aprobar) {
      const respuesta = window.prompt("¿Por qué se rechaza? (el empleado lo va a ver, opcional)");
      if (respuesta === null) return; // canceló, no rechazar nada
      comentario = respuesta.trim() || undefined;
    }
    if (recurso === "correcciones") setCorrecciones((p) => p.filter((c) => c.id !== id));
    else setAusencias((p) => p.filter((a) => a.id !== id));
    await fetch(`/api/${recurso}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aprobar, comentario }),
    });
    cargar(localId);
  }

  if (cargando) return <Spinner />;

  const conteo = (estado: Estado) => filas.filter((f) => f.estado === estado).length;
  const pendientes = alertas.length + correcciones.length + ausencias.length + rostros.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Presencia</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {actualizado
              ? `Actualizado ${actualizado.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Hoy en tiempo real"}
          </p>
        </div>
        <Button variant="ghost" onClick={() => cargar(localId)} className="shrink-0">
          <RefreshCw size={15} />
          Actualizar
        </Button>
      </div>

      {locales.length > 1 && (
        <Select value={localId} onChange={(e) => setLocalId(e.target.value)} className="max-w-xs">
          <option value="">Todas las sucursales</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </Select>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Resumen titulo="Trabajando" valor={conteo("TRABAJANDO")} tono="emerald" />
        <Resumen titulo="En descanso" valor={conteo("EN_DESCANSO")} tono="amber" />
        <Resumen titulo="Sin fichar" valor={conteo("FALTA")} tono="red" />
        <Resumen titulo="Pendientes" valor={pendientes} tono={pendientes > 0 ? "amber" : "slate"} />
      </div>

      {alertas.length > 0 && (
        <div>
          <SectionTitle>Avisos</SectionTitle>
          <div className="flex flex-col gap-2">
            {alertas.map((a) => (
              <Card
                key={a.id}
                className="flex items-center justify-between gap-3 border-amber-200 bg-amber-50 dark:border-[#5a4a2f] dark:bg-[#241f14]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {a.empleado} · {ETIQUETA_ALERTA[a.tipo] ?? a.tipo}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-[#c1cbc6]">{a.detalle}</p>
                </div>
                <Button variant="ghost" onClick={() => resolverAlerta(a.id)} className="shrink-0">
                  <Check size={15} />
                  Visto
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {rostros.length > 0 && (
        <div>
          <SectionTitle>Fichajes sin verificar el rostro</SectionTitle>
          <div className="flex flex-col gap-2">
            {rostros.map((r) => (
              <Card
                key={r.id}
                className="flex items-start justify-between gap-3 border-amber-200 bg-amber-50 dark:border-[#5a4a2f] dark:bg-[#241f14]"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <ScanFace size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    {r.empleado}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-[#c1cbc6]">
                    {ETIQUETA_FICHAJE[r.tipo] ?? r.tipo} de {hora(r.timestamp)} ·{" "}
                    {MOTIVO_ROSTRO[r.rostro]}
                    {r.distancia !== null && ` (distancia ${r.distancia})`}
                  </p>
                </div>
                {r.tieneFoto && (
                  <a href={`/api/fichajes/${r.id}/foto`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- la sirve nuestra API, no hay nada que optimizar */}
                    <img
                      src={`/api/fichajes/${r.id}/foto`}
                      alt={`Foto del fichaje de ${r.empleado}`}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  </a>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {correcciones.length > 0 && (
        <div>
          <SectionTitle>Correcciones de fichaje</SectionTitle>
          <div className="flex flex-col gap-2">
            {correcciones.map((c) => (
              <Card key={c.id} className="flex flex-col gap-3">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <PencilLine size={15} className="shrink-0 text-slate-400" />
                    {c.empleado}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-[#c1cbc6]">
                    {c.tipo === "AGREGAR" && (
                      <>
                        Pide agregar una <strong>{ETIQUETA_FICHAJE[c.tipoFichaje ?? ""]}</strong> el{" "}
                        {diaLocal(c.fechaHora!)} a las {hora(c.fechaHora)}
                      </>
                    )}
                    {c.tipo === "MODIFICAR" && (
                      <>
                        Pide cambiar {ETIQUETA_FICHAJE[c.actual?.tipo ?? ""]} de {hora(c.actual?.timestamp ?? null)} a{" "}
                        <strong>
                          {ETIQUETA_FICHAJE[c.tipoFichaje ?? ""]} {hora(c.fechaHora)}
                        </strong>
                      </>
                    )}
                    {c.tipo === "ELIMINAR" && (
                      <>
                        Pide borrar {ETIQUETA_FICHAJE[c.actual?.tipo ?? ""]} de{" "}
                        {hora(c.actual?.timestamp ?? null)}
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-sm italic text-slate-500 dark:text-[#94a19c]">“{c.motivo}”</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => resolver("correcciones", c.id, true)} className="flex-1">
                    <Check size={15} />
                    Aprobar
                  </Button>
                  <Button variant="danger" onClick={() => resolver("correcciones", c.id, false)}>
                    <X size={15} />
                    Rechazar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {ausencias.length > 0 && (
        <div>
          <SectionTitle>Ausencias y licencias</SectionTitle>
          <div className="flex flex-col gap-2">
            {ausencias.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Palmtree size={15} className="shrink-0 text-slate-400" />
                    {a.empleado}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-[#c1cbc6]">
                    <strong>{ETIQUETA_AUSENCIA[a.tipo] ?? a.tipo}</strong> ·{" "}
                    {formatearFechaSql(a.desde)}
                    {a.desde !== a.hasta && ` al ${formatearFechaSql(a.hasta)}`}
                  </p>
                  {a.motivo && (
                    <p className="mt-1 text-sm italic text-slate-500 dark:text-[#94a19c]">“{a.motivo}”</p>
                  )}
                  {a.tieneCertificado && (
                    <a
                      href={`/api/ausencias/${a.id}/certificado`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline dark:text-[#4ee6b0]"
                    >
                      <FileText size={14} />
                      Ver certificado
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => resolver("ausencias", a.id, true)} className="flex-1">
                    <Check size={15} />
                    Aprobar
                  </Button>
                  <Button variant="danger" onClick={() => resolver("ausencias", a.id, false)}>
                    <X size={15} />
                    Rechazar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filas.length === 0 ? (
        <EmptyState>No hay empleados activos cargados</EmptyState>
      ) : (
        GRUPOS.map(({ estado, titulo, Icono, tono }) => {
          const delGrupo = filas.filter((f) => f.estado === estado);
          if (delGrupo.length === 0) return null;
          return (
            <div key={estado}>
              <SectionTitle>
                <span className={`inline-flex items-center gap-1.5 ${tono}`}>
                  <Icono size={15} />
                  {titulo} ({delGrupo.length})
                </span>
              </SectionTitle>
              <div className="flex flex-col gap-2">
                {delGrupo.map((f) => (
                  <Card key={f.empleadoId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{f.nombre}</p>
                      <p className="truncate text-sm text-slate-500 dark:text-[#94a19c]">
                        {f.ausencia
                          ? (ETIQUETA_AUSENCIA[f.ausencia] ?? f.ausencia)
                          : f.turno
                            ? `Turno ${f.turno.horaInicio}–${f.turno.horaFin}`
                            : "Sin turno asignado"}
                        {f.entrada && ` · entró ${hora(f.entrada)}`}
                        {f.salida && ` · salió ${hora(f.salida)}`}
                      </p>
                      {f.minutosTarde > 0 && (
                        <div className="mt-1.5">
                          <Badge tone="amber">{f.minutosTarde} min tarde</Badge>
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-600 dark:text-[#c1cbc6]">
                      {f.horasTrabajadas.toFixed(2)} h
                    </span>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Resumen({
  titulo,
  valor,
  tono,
}: {
  titulo: string;
  valor: number;
  tono: "emerald" | "amber" | "red" | "slate";
}) {
  const colores = {
    emerald: "text-emerald-700 dark:text-[#4ee6b0]",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    slate: "text-slate-500",
  };
  return (
    <Card className="text-center">
      <p className={`text-2xl font-bold ${colores[tono]}`}>{valor}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-[#94a19c]">{titulo}</p>
    </Card>
  );
}
