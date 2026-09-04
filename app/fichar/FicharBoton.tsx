"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Coffee, LogIn, LogOut, MapPin, Play } from "lucide-react";
import { Badge, Button, Card, ErrorText, SectionTitle } from "@/components/ui";
import MisSolicitudes from "./MisSolicitudes";
import RegistrarRostro from "./RegistrarRostro";
import VerificarRostroModal, { type ResultadoVerificacion } from "./VerificarRostroModal";
import ArqueoModal from "./ArqueoModal";
import { formatearFechaSql } from "@/lib/fechas";
import { precargarModelos } from "@/lib/rostroCliente";

type TipoFichaje = "ENTRADA" | "SALIDA" | "DESCANSO_INICIO" | "DESCANSO_FIN";
type Fichaje = { id: string; tipo: TipoFichaje; timestamp: string };
type Turno = { id: string; fecha: string; horaInicio: string; horaFin: string };

const ETIQUETA: Record<TipoFichaje, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  DESCANSO_INICIO: "Inicio descanso",
  DESCANSO_FIN: "Fin descanso",
};

function obtenerUbicacion(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export default function FicharBoton({
  nombreEmpleado,
  turnos,
}: {
  nombreEmpleado: string;
  turnos: Turno[];
}) {
  const [fichajesHoy, setFichajesHoy] = useState<Fichaje[]>([]);
  const [proximoTipo, setProximoTipo] = useState<TipoFichaje>("ENTRADA");
  const [horasTrabajadas, setHorasTrabajadas] = useState(0);
  const [turnoHoy, setTurnoHoy] = useState<{ horaInicio: string; horaFin: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [rostro, setRostro] = useState<{ exigido: boolean; registrado: boolean }>({
    exigido: false,
    registrado: false,
  });
  const [verificando, setVerificando] = useState(false);
  const resolverVerificacion = useRef<((r: ResultadoVerificacion) => void) | null>(null);
  const [arqueo, setArqueo] = useState<{ fichajeId: string; efectivoEsperado: number } | null>(null);

  /** Abre el modal de cámara y devuelve el resultado cuando termina de analizar. */
  function pedirVerificacionRostro(): Promise<ResultadoVerificacion> {
    return new Promise((resolve) => {
      resolverVerificacion.current = resolve;
      setVerificando(true);
    });
  }

  async function cargar() {
    const [resFichajes, resRostro] = await Promise.all([
      fetch("/api/fichajes"),
      fetch("/api/rostro"),
    ]);
    const data = await resFichajes.json();
    const r = await resRostro.json();
    setFichajesHoy(data.fichajesHoy ?? []);
    setProximoTipo(data.proximoTipo ?? "ENTRADA");
    setHorasTrabajadas(data.horasTrabajadas ?? 0);
    setTurnoHoy(data.turno ?? null);
    setRostro({ exigido: Boolean(r.exigido), registrado: Boolean(r.registrado) });
    setCargando(false);
    // Con el control activo, los 6.5 MB de modelos se bajan mientras el
    // empleado mira la pantalla, no cuando aprieta el botón.
    if (r.exigido) precargarModelos();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
  }, []);

  async function marcar(tipo?: "DESCANSO_INICIO") {
    setMarcando(true);
    setError("");
    setAviso("");

    setPaso("Buscando tu ubicación…");
    const pos = await obtenerUbicacion();

    let datosRostro: ResultadoVerificacion = {};
    if (rostro.exigido && rostro.registrado) {
      datosRostro = await pedirVerificacionRostro();
    }

    setPaso("Registrando…");
    const res = await fetch("/api/fichajes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}),
        ...(tipo ? { tipo } : {}),
        ...datosRostro,
      }),
    });
    const data = await res.json();
    setPaso("");
    if (!res.ok) {
      setError(data.error ?? "No se pudo fichar");
      setMarcando(false);
      return;
    }
    // El fichaje quedó, pero el encargado lo va a ver marcado.
    if (data.rostro && data.rostro !== "OK" && data.rostro !== "OMITIDA") {
      setAviso(
        data.rostro === "NO_COINCIDE"
          ? "Fichaje registrado, pero no pudimos confirmar que seas vos. El encargado lo va a revisar."
          : "Fichaje registrado sin verificar tu rostro. El encargado lo va a revisar."
      );
    }
    if (data.fichaje?.efectivoEsperado != null) {
      setArqueo({ fichajeId: data.fichaje.id, efectivoEsperado: data.fichaje.efectivoEsperado });
    }
    await cargar();
    setMarcando(false);
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
      </div>
    );
  }

  const trabajando = proximoTipo === "SALIDA";
  const enDescanso = proximoTipo === "DESCANSO_FIN";

  const estilo = enDescanso
    ? "bg-amber-500 hover:bg-amber-600"
    : trabajando
      ? "bg-red-600 hover:bg-red-700"
      : "bg-emerald-600 hover:bg-emerald-700 dark:bg-[#4ee6b0] dark:text-[#062419] dark:hover:bg-[#72efc1]";

  const texto = enDescanso ? "Volver del descanso" : trabajando ? "Marcar salida" : "Marcar entrada";
  const Icono = enDescanso ? Play : trabajando ? LogOut : LogIn;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-lg font-semibold">Hola, {nombreEmpleado}</p>
        {turnoHoy && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
            Tu turno hoy: {turnoHoy.horaInicio}–{turnoHoy.horaFin}
          </p>
        )}
      </div>

      <button
        onClick={() => marcar()}
        disabled={marcando}
        className={`flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-full text-lg font-bold text-white shadow-[0_18px_45px_-12px_rgba(16,185,129,0.55)] transition disabled:opacity-60 ${estilo}`}
      >
        <Icono size={30} />
        <span className="px-2 text-center leading-tight">
          {marcando ? (paso || "Marcando…") : texto}
        </span>
      </button>

      {trabajando && (
        <Button variant="ghost" onClick={() => marcar("DESCANSO_INICIO")} disabled={marcando}>
          <Coffee size={16} />
          Iniciar descanso
        </Button>
      )}

      <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-[#74817b]">
        <MapPin size={13} />
        Usamos tu ubicación solo para confirmar que estás en el local
      </div>

      <div className="w-full max-w-xs">
        <ErrorText>{error}</ErrorText>
        {aviso && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-[#5a4a2f] dark:bg-[#241f14] dark:text-amber-200">
            {aviso}
          </p>
        )}
      </div>

      {verificando && (
        <VerificarRostroModal
          onTerminado={(r) => {
            setVerificando(false);
            resolverVerificacion.current?.(r);
            resolverVerificacion.current = null;
          }}
        />
      )}

      {rostro.exigido && <RegistrarRostro registrado={rostro.registrado} onListo={cargar} />}

      {arqueo && (
        <ArqueoModal
          fichajeId={arqueo.fichajeId}
          efectivoEsperado={arqueo.efectivoEsperado}
          onListo={() => setArqueo(null)}
        />
      )}

      <Card className="w-full max-w-xs">
        <SectionTitle
          action={
            <span className="text-sm font-semibold text-emerald-700 dark:text-[#4ee6b0]">
              {horasTrabajadas.toFixed(2)} h
            </span>
          }
        >
          Fichajes de hoy
        </SectionTitle>
        {fichajesHoy.length === 0 ? (
          <p className="text-center text-sm text-slate-400 dark:text-[#74817b]">Sin fichajes todavía</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fichajesHoy.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm">
                <Badge
                  tone={
                    f.tipo === "ENTRADA" ? "emerald" : f.tipo === "SALIDA" ? "slate" : "amber"
                  }
                >
                  {ETIQUETA[f.tipo]}
                </Badge>
                <span className="text-slate-500 dark:text-[#94a19c]">{hora(f.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MisSolicitudes />

      {turnos.length > 0 && (
        <Card className="w-full max-w-xs">
          <SectionTitle>Próximos turnos</SectionTitle>
          <ul className="flex flex-col gap-2 text-sm">
            {turnos.map((t) => (
              <li key={t.id} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-[#c1cbc6]">
                  <Clock size={14} />
                  {formatearFechaSql(t.fecha, { day: "2-digit", month: "2-digit", year: "numeric" })}
                </span>
                <span className="text-slate-500 dark:text-[#94a19c]">
                  {t.horaInicio}–{t.horaFin}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
