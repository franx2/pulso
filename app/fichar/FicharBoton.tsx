"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, Coffee, LocateFixed, LogIn, LogOut, MapPin, PencilLine, Play, RotateCw } from "lucide-react";
import { Badge, Button, Card, ErrorText, SectionTitle } from "@/components/ui";
import MisSolicitudes, { ModalCorreccion, type FichajeACorregir } from "./MisSolicitudes";
import RegistrarRostro from "./RegistrarRostro";
import VerificarRostroModal, { type ResultadoVerificacion } from "./VerificarRostroModal";
import ArqueoModal from "./ArqueoModal";
import FondoInicialModal from "./FondoInicialModal";
import { formatearFechaSql } from "@/lib/fechas";
import { calcularHoras } from "@/lib/horas";
import { duracion } from "@/lib/formato";
import { precargarModelos } from "@/lib/rostroCliente";

type TipoFichaje = "ENTRADA" | "SALIDA" | "DESCANSO_INICIO" | "DESCANSO_FIN";
type Fichaje = { id: string; tipo: TipoFichaje; timestamp: string; corregido?: boolean };
type Turno = { id: string; fecha: string; horaInicio: string; horaFin: string };
type DiaSemana = { dia: string; horas: number };

const ETIQUETA: Record<TipoFichaje, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  DESCANSO_INICIO: "Salió al descanso",
  DESCANSO_FIN: "Volvió del descanso",
};

const ICONO: Record<TipoFichaje, typeof LogIn> = {
  ENTRADA: LogIn,
  SALIDA: LogOut,
  DESCANSO_INICIO: Coffee,
  DESCANSO_FIN: Play,
};

const EXITO: Record<TipoFichaje, string> = {
  ENTRADA: "Entrada registrada",
  SALIDA: "Salida registrada",
  DESCANSO_INICIO: "Descanso iniciado",
  DESCANSO_FIN: "Volviste del descanso",
};

type Ubicacion = { pos: GeolocationPosition } | { pos: null; motivo: "denegada" | "sin_senal" | "no_soportada" };

function obtenerUbicacion(): Promise<Ubicacion> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ pos: null, motivo: "no_soportada" });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ pos }),
      (e) => resolve({ pos: null, motivo: e.code === e.PERMISSION_DENIED ? "denegada" : "sin_senal" }),
      // Una posición de hace medio minuto sirve igual y evita esperar al GPS.
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  });
}

/** Qué hacer cuando el GPS no responde: el fichaje lo exige, así que se explica cómo destrabarlo. */
const AYUDA_UBICACION: Record<"denegada" | "sin_senal" | "no_soportada", string> = {
  denegada:
    "El navegador no tiene permiso para ver tu ubicación. Tocá el candado al lado de la dirección, entrá a Permisos, poné Ubicación en Permitir y volvé a marcar.",
  sin_senal:
    "Tu celular no encontró la ubicación. Fijate que la Ubicación (GPS) esté prendida, acercate a una ventana o a la puerta y volvé a marcar.",
  no_soportada: "Este navegador no puede dar la ubicación. Probá desde Chrome o Safari actualizados.",
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const diaCorto = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${DIA_CORTO[d.getUTCDay()]} ${d.getUTCDate()}`;
};
const hoyClave = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** La hora que corre, para que el contador de horas no quede congelado. */
function useAhora(cadaMs: number) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return ahora;
}

export default function FicharBoton({ nombreEmpleado, turnos }: { nombreEmpleado: string; turnos: Turno[] }) {
  const [fichajesHoy, setFichajesHoy] = useState<Fichaje[]>([]);
  const [proximoTipo, setProximoTipo] = useState<TipoFichaje>("ENTRADA");
  const [turnoHoy, setTurnoHoy] = useState<{ horaInicio: string; horaFin: string } | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [descuentaDescanso, setDescuentaDescanso] = useState(true);
  const [semana, setSemana] = useState<DiaSemana[]>([]);
  const [jornadaDia, setJornadaDia] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [paso, setPaso] = useState("");
  const [error, setError] = useState("");
  const [ayudaUbicacion, setAyudaUbicacion] = useState("");
  const [aviso, setAviso] = useState("");
  const [exito, setExito] = useState("");
  const [rostro, setRostro] = useState<{ exigido: boolean; registrado: boolean }>({ exigido: false, registrado: false });
  const [verificando, setVerificando] = useState(false);
  const resolverVerificacion = useRef<((r: ResultadoVerificacion) => void) | null>(null);
  const [arqueo, setArqueo] = useState<{
    fichajeId: string;
    efectivoEsperado: number;
    fondoInicial: number | null;
    efectivoVendido: number | null;
    gastosEfectivo: number | null;
  } | null>(null);
  const [fondoInicialPendiente, setFondoInicialPendiente] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<FichajeACorregir | null>(null);
  const [revisionSolicitudes, setRevisionSolicitudes] = useState(0);
  const ahora = useAhora(20_000);

  /** Abre el modal de cámara y devuelve el resultado cuando termina de analizar. */
  function pedirVerificacionRostro(): Promise<ResultadoVerificacion> {
    return new Promise((resolve) => {
      resolverVerificacion.current = resolve;
      setVerificando(true);
    });
  }

  /**
   * Trae el estado del día y lo devuelve. Los fichajes son lo esencial: si
   * fallan, tira. La configuración del rostro es accesoria: si falla se sigue
   * sin ella —el servidor igual deja el fichaje marcado "sin verificar" para el
   * encargado— porque una cámara que no responde no puede dejar a nadie sin
   * poder fichar.
   */
  async function cargar(): Promise<Fichaje[]> {
    const [resFichajes, resRostro] = await Promise.all([fetch("/api/fichajes"), fetch("/api/rostro").catch(() => null)]);
    if (!resFichajes.ok) throw new Error("No se pudieron cargar los fichajes");
    const data = await resFichajes.json();
    const r = resRostro?.ok ? await resRostro.json().catch(() => ({})) : {};
    const hoy: Fichaje[] = data.fichajesHoy ?? [];
    setFichajesHoy(hoy);
    setProximoTipo(data.proximoTipo ?? "ENTRADA");
    setTurnoHoy(data.turno ?? null);
    setLocal(data.local ?? null);
    setDescuentaDescanso(data.descuentaDescanso ?? true);
    setSemana(data.semana ?? []);
    setJornadaDia(data.jornadaDia ?? null);
    setRostro({ exigido: Boolean(r.exigido), registrado: Boolean(r.registrado) });
    // Con el control activo, los 6.5 MB de modelos se bajan mientras el
    // empleado mira la pantalla, no cuando aprieta el botón.
    if (r.exigido) precargarModelos();
    return hoy;
  }

  async function cargarInicial() {
    setErrorCarga(false);
    setCargando(true);
    try {
      await cargar();
    } catch {
      // Sin red, el empleado veía una rueda girando para siempre.
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargarInicial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Se cortó la comunicación en medio de un fichaje: el servidor pudo haberlo
   * recibido o no. Reintentar a ciegas arriesga duplicarlo, así que primero se
   * mira cuántos fichajes hay de verdad.
   */
  async function reconciliar(cantidadAntes: number) {
    try {
      const hoy = await cargar();
      if (hoy.length > cantidadAntes) {
        const ultimo = hoy[hoy.length - 1];
        setExito(`${EXITO[ultimo.tipo]} a las ${hora(ultimo.timestamp)}`);
        setAviso("Se cortó la conexión, pero tu fichaje quedó registrado.");
      } else {
        setError("No se pudo registrar el fichaje. Revisá tu conexión y volvé a intentar.");
      }
    } catch {
      setError(
        "No pudimos confirmar si el fichaje quedó registrado. Antes de volver a marcar, esperá a tener conexión o avisale a tu encargado."
      );
    }
  }

  async function marcar(tipo?: "DESCANSO_INICIO") {
    setMarcando(true);
    setError("");
    setAyudaUbicacion("");
    setAviso("");
    setExito("");
    const cantidadAntes = fichajesHoy.length;

    try {
      setPaso("Buscando tu ubicación…");
      const ubicacion = await obtenerUbicacion();

      let datosRostro: ResultadoVerificacion = {};
      if (rostro.exigido && rostro.registrado) datosRostro = await pedirVerificacionRostro();

      setPaso("Registrando…");
      const res = await fetch("/api/fichajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(ubicacion.pos ? { lat: ubicacion.pos.coords.latitude, lng: ubicacion.pos.coords.longitude } : {}),
          ...(tipo ? { tipo } : {}),
          ...datosRostro,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo fichar");
        // El servidor pide la ubicación y el celular no la dio: decir cómo destrabarlo.
        if (!ubicacion.pos) setAyudaUbicacion(AYUDA_UBICACION[ubicacion.motivo]);
        return;
      }
      const tipoHecho = (data.fichaje?.tipo ?? "ENTRADA") as TipoFichaje;
      setExito(`${EXITO[tipoHecho]} a las ${hora(data.fichaje?.timestamp ?? new Date().toISOString())}${data.local ? ` · ${data.local}` : ""}`);
      navigator.vibrate?.(40);
      // El fichaje quedó, pero el encargado lo va a ver marcado.
      if (data.rostro && data.rostro !== "OK" && data.rostro !== "OMITIDA") {
        setAviso(
          data.rostro === "NO_COINCIDE"
            ? "No pudimos confirmar que seas vos. Tu encargado lo va a revisar."
            : "Se registró sin verificar tu rostro. Tu encargado lo va a revisar."
        );
      }
      if (data.fichaje?.efectivoEsperado != null) {
        setArqueo({
          fichajeId: data.fichaje.id,
          efectivoEsperado: data.fichaje.efectivoEsperado,
          fondoInicial: data.fondoInicial ?? null,
          efectivoVendido: data.efectivoVendido ?? null,
          gastosEfectivo: data.gastosEfectivo ?? null,
        });
      } else if (tipoHecho === "ENTRADA" && data.usaCaja) {
        setFondoInicialPendiente(data.fichaje.id);
      }
      // El fichaje ya está hecho: si refrescar la pantalla falla, no es motivo
      // para decirle al empleado que algo salió mal.
      await cargar().catch(() => undefined);
    } catch {
      await reconciliar(cantidadAntes);
    } finally {
      setPaso("");
      setMarcando(false);
    }
  }

  // Las horas de hoy corren solas mientras está adentro.
  const jornada = useMemo(
    () =>
      calcularHoras(
        fichajesHoy.map((f) => ({ tipo: f.tipo, timestamp: new Date(f.timestamp) })),
        { descuentaDescanso, ahora }
      ),
    [fichajesHoy, descuentaDescanso, ahora]
  );

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16" aria-label="Cargando tu jornada">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-700 dark:border-[#29403b] dark:border-t-[#37e6b0]" />
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="max-w-xs text-sm text-slate-600 dark:text-[#c1cbc6]">No pudimos cargar tu fichaje. Revisá la conexión y probá de nuevo.</p>
        <Button type="button" onClick={cargarInicial}>
          <RotateCw size={16} aria-hidden />
          Reintentar
        </Button>
      </div>
    );
  }

  const trabajando = proximoTipo === "SALIDA";
  const enDescanso = proximoTipo === "DESCANSO_FIN";
  const ultimo = fichajesHoy[fichajesHoy.length - 1];
  const terminoHoy = !trabajando && !enDescanso && fichajesHoy.some((f) => f.tipo === "SALIDA");

  // Entrar es la acción primaria (teal); salir, tinta: no es un error, es el
  // final del día. El ámbar queda para el estado de descanso.
  const estilo = enDescanso
    ? "bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-[#241703] dark:hover:bg-amber-300"
    : trabajando
      ? "bg-[#17211e] text-white hover:bg-black dark:bg-[#f2f7f4] dark:text-[#0b1412] dark:hover:bg-white"
      : "bg-[#0f766e] text-white hover:bg-[#115e59] dark:bg-[#37e6b0] dark:text-[#062419] dark:hover:bg-[#72efc1]";
  const texto = enDescanso ? "Volver del descanso" : trabajando ? "Marcar salida" : "Marcar entrada";
  const Icono = enDescanso ? Play : trabajando ? LogOut : LogIn;

  const desde = (d: Date | null | undefined) => (d ? ` desde las ${hora(d.toISOString())}` : "");
  const estadoTexto = enDescanso
    ? `En descanso${desde(ultimo ? new Date(ultimo.timestamp) : null)}`
    : trabajando
      ? `Trabajando${desde(jornada.entrada)}`
      : terminoHoy && jornada.salida
        ? `Terminaste a las ${hora(jornada.salida.toISOString())}`
        : turnoHoy
          ? `Tu turno empieza a las ${turnoHoy.horaInicio}`
          : "Todavía no marcaste la entrada";

  const hoy = hoyClave();
  // Lo que corre en vivo es de la jornada en pantalla, que pasada la
  // medianoche puede ser la que empezó ayer.
  const diaEnVivo = jornadaDia ?? hoy;
  const semanaConHoy = semana.map((d) => (d.dia === diaEnVivo ? { ...d, horas: jornada.horasTrabajadas } : d));
  const totalSemana = semanaConHoy.reduce((s, d) => s + d.horas, 0);
  const maximo = Math.max(9, ...semanaConHoy.map((d) => d.horas));

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5">
      <header className="text-center">
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          {ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          {local && ` · ${local}`}
        </p>
        <p className="mt-0.5 text-xl font-bold text-slate-950 dark:text-[#f2f7f4]">Hola, {nombreEmpleado.split(" ")[0]}</p>
        {turnoHoy && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-[#94a19c]">
            Turno de hoy {turnoHoy.horaInicio}–{turnoHoy.horaFin}
          </p>
        )}
      </header>

      <section aria-label="Fichar" className="flex flex-col items-center gap-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-[#c1cbc6]">
          {(trabajando || enDescanso) && (
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${
                  enDescanso ? "bg-amber-500" : "bg-[#37e6b0]"
                }`}
              />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${enDescanso ? "bg-amber-500" : "bg-[#37e6b0]"}`} />
            </span>
          )}
          {estadoTexto}
        </p>

        <button
          type="button"
          onClick={() => marcar()}
          disabled={marcando}
          className={`flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-full text-lg font-bold shadow-[0_16px_32px_-14px_rgba(15,23,42,0.55)] transition-[transform,background-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f6f8f5] active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-[#37e6b0]/50 dark:focus-visible:ring-offset-[#0b1412] ${estilo}`}
        >
          <Icono size={32} aria-hidden />
          <span className="px-4 text-center leading-tight">{marcando ? paso || "Marcando…" : texto}</span>
        </button>

        {fichajesHoy.length > 0 && (
        <p className="text-center tabular-nums">
          <span className="text-3xl font-bold text-slate-950 dark:text-[#f2f7f4]">{duracion(jornada.horasTrabajadas)}</span>
          <span className="ml-1.5 text-sm text-slate-500 dark:text-[#94a19c]">trabajadas hoy</span>
        </p>
        )}

        {trabajando && (
          <Button variant="ghost" onClick={() => marcar("DESCANSO_INICIO")} disabled={marcando}>
            <Coffee size={16} aria-hidden />
            Salir al descanso
          </Button>
        )}

        <div className="w-full space-y-2" aria-live="polite">
          {exito && (
            <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-900 dark:border-[#1d4e48] dark:bg-[#0f2620] dark:text-[#cdfbea]">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden />
              {exito}
            </p>
          )}
          {aviso && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-[#5a4a2f] dark:bg-[#241f14] dark:text-amber-200">
              {aviso}
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          {ayudaUbicacion && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#c1cbc6]">
              <p className="flex items-start gap-2">
                <LocateFixed size={17} className="mt-0.5 shrink-0 text-emerald-700 dark:text-[#37e6b0]" aria-hidden />
                {ayudaUbicacion}
              </p>
              <Button variant="ghost" className="mt-3 w-full" onClick={() => marcar()} disabled={marcando}>
                <RotateCw size={15} aria-hidden />
                Probar de nuevo
              </Button>
            </div>
          )}
        </div>

        <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#7a8882]">
          <MapPin size={13} aria-hidden />
          Tu ubicación sólo se usa para confirmar que estás en el local
        </p>
      </section>

      {verificando && (
        <VerificarRostroModal
          onTerminado={(r) => {
            setVerificando(false);
            resolverVerificacion.current?.(r);
            resolverVerificacion.current = null;
          }}
        />
      )}

      {rostro.exigido && !rostro.registrado && (
        <RegistrarRostro registrado={false} onListo={() => void cargar().catch(() => undefined)} />
      )}

      {fondoInicialPendiente && <FondoInicialModal fichajeId={fondoInicialPendiente} onListo={() => setFondoInicialPendiente(null)} />}

      {arqueo && (
        <ArqueoModal
          fichajeId={arqueo.fichajeId}
          efectivoEsperado={arqueo.efectivoEsperado}
          fondoInicial={arqueo.fondoInicial}
          efectivoVendido={arqueo.efectivoVendido}
          gastosEfectivo={arqueo.gastosEfectivo}
          onListo={() => setArqueo(null)}
        />
      )}

      <Card>
        <SectionTitle>{diaEnVivo === hoy ? "Hoy" : "Tu turno de anoche"}</SectionTitle>
        {fichajesHoy.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">Cuando marques, tus fichajes aparecen acá.</p>
        ) : (
          <ol className="divide-y divide-slate-100 dark:divide-[#1c2521]">
            {fichajesHoy.map((f) => {
              const IconoFila = ICONO[f.tipo];
              return (
                <li key={f.id} className="flex items-center gap-3 py-1.5">
                  <IconoFila size={16} className="shrink-0 text-slate-500 dark:text-[#94a19c]" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">
                    {ETIQUETA[f.tipo]}
                    {f.corregido && (
                      <span className="ml-2">
                        <Badge tone="slate">corregido</Badge>
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{hora(f.timestamp)}</span>
                  <button
                    type="button"
                    onClick={() => setCorrigiendo(f)}
                    aria-label={`Corregir ${ETIQUETA[f.tipo].toLowerCase()} de las ${hora(f.timestamp)}`}
                    className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-[#94a19c] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4]"
                  >
                    <PencilLine size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {semanaConHoy.length > 0 && (
        <Card>
          <SectionTitle action={<span className="text-sm font-semibold tabular-nums">{duracion(totalSemana)}</span>}>Tu semana</SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {semanaConHoy.map((d) => {
              const esHoy = d.dia === hoy;
              const futuro = d.dia > hoy;
              return (
                <li key={d.dia} className="grid grid-cols-[3.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
                  <span className={esHoy ? "font-semibold" : "text-slate-500 dark:text-[#94a19c]"}>{diaCorto(d.dia)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#18201d]" aria-hidden>
                    <span
                      className={`block h-full rounded-full ${esHoy ? "bg-[#37e6b0]" : "bg-[#0f766e] dark:bg-[#2aa996]"}`}
                      style={{ width: `${(d.horas / maximo) * 100}%` }}
                    />
                  </span>
                  <span className={`text-right tabular-nums ${d.horas > 0 ? "" : "text-slate-400 dark:text-[#5f6d67]"}`}>
                    {futuro ? "" : d.horas > 0 ? duracion(d.horas) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <MisSolicitudes revision={revisionSolicitudes} />

      {turnos.length > 0 && (
        <Card>
          <SectionTitle>Próximos turnos</SectionTitle>
          <ul className="flex flex-col gap-2 text-sm">
            {turnos.map((t) => (
              <li key={t.id} className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-[#c1cbc6]">
                  <Clock size={14} aria-hidden />
                  {formatearFechaSql(t.fecha, { weekday: "short", day: "2-digit", month: "2-digit" })}
                </span>
                <span className="tabular-nums text-slate-500 dark:text-[#94a19c]">
                  {t.horaInicio}–{t.horaFin}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rostro.exigido && rostro.registrado && (
        <RegistrarRostro registrado onListo={() => void cargar().catch(() => undefined)} />
      )}

      {corrigiendo && (
        <ModalCorreccion
          fichaje={corrigiendo}
          onClose={() => setCorrigiendo(null)}
          onListo={() => {
            setCorrigiendo(null);
            setRevisionSolicitudes((n) => n + 1);
            setExito("Pedido enviado. Tu encargado lo va a revisar.");
          }}
        />
      )}
    </div>
  );
}
