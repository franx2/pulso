"use client";

import { useEffect, useState } from "react";
import { fechaCorta } from "@/lib/formato";
import { Camera, PencilLine, Palmtree, Plus } from "lucide-react";
import { achicarImagen } from "@/lib/imagen";
import { formatearFechaSql } from "@/lib/fechas";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Input,
  Label,
  Modal,
  SectionTitle,
  Select,
} from "@/components/ui";

type EstadoSolicitud = "PENDIENTE" | "APROBADA" | "RECHAZADA";

type Correccion = {
  id: string;
  tipo: string;
  tipoFichaje: string | null;
  fechaHora: string | null;
  motivo: string;
  estado: EstadoSolicitud;
  comentario: string | null;
};

type Ausencia = {
  id: string;
  tipo: string;
  desde: string;
  hasta: string;
  motivo: string | null;
  estado: EstadoSolicitud;
  comentario: string | null;
};

const ETIQUETA_AUSENCIA: Record<string, string> = {
  VACACIONES: "Vacaciones",
  ENFERMEDAD: "Enfermedad",
  FRANCO: "Franco",
  LICENCIA: "Licencia",
  FALTA: "Falta",
  OTRO: "Otro",
};

const ETIQUETA_FICHAJE: Record<string, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  DESCANSO_INICIO: "Inicio descanso",
  DESCANSO_FIN: "Fin descanso",
};

const TONO: Record<EstadoSolicitud, "amber" | "emerald" | "slate"> = {
  PENDIENTE: "amber",
  APROBADA: "emerald",
  RECHAZADA: "slate",
};

/** Instante real (fichaje corregido): se muestra en hora local. */
const diaLocal = (iso: string) =>
  fechaCorta(new Date(iso));
const hoyISODe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** `revision` cambia cuando se pidió una corrección desde la lista de hoy. */
export default function MisSolicitudes({ revision = 0 }: { revision?: number }) {
  const [correcciones, setCorrecciones] = useState<Correccion[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [modal, setModal] = useState<"correccion" | "ausencia" | null>(null);

  async function cargar() {
    const [c, a] = await Promise.all([
      fetch("/api/correcciones").then((r) => r.json()),
      fetch("/api/ausencias").then((r) => r.json()),
    ]);
    setCorrecciones(c.correcciones ?? []);
    setAusencias(a.ausencias ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar().catch(() => undefined);
  }, [revision]);

  const pendientes = [...correcciones, ...ausencias].filter((s) => s.estado === "PENDIENTE").length;

  return (
    <Card className="w-full">
      <SectionTitle
        action={pendientes > 0 ? <Badge tone="amber">{pendientes} pendiente{pendientes === 1 ? "" : "s"}</Badge> : undefined}
      >
        Mis solicitudes
      </SectionTitle>

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 text-xs" onClick={() => setModal("correccion")}>
          <PencilLine size={14} />
          Falta un fichaje
        </Button>
        <Button variant="ghost" className="flex-1 text-xs" onClick={() => setModal("ausencia")}>
          <Palmtree size={14} />
          Pedir ausencia
        </Button>
      </div>

      {(correcciones.length > 0 || ausencias.length > 0) && (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {ausencias.slice(0, 4).map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-slate-600 dark:text-[#c1cbc6]">
                  {ETIQUETA_AUSENCIA[a.tipo] ?? a.tipo} · {formatearFechaSql(a.desde)}
                </span>
                <Badge tone={TONO[a.estado]}>{a.estado.toLowerCase()}</Badge>
              </div>
              {a.estado === "RECHAZADA" && a.comentario && (
                <p className="text-xs italic text-slate-500 dark:text-[#94a19c]">“{a.comentario}”</p>
              )}
            </li>
          ))}
          {correcciones.slice(0, 4).map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-slate-600 dark:text-[#c1cbc6]">
                  {c.fechaHora
                    ? `${ETIQUETA_FICHAJE[c.tipoFichaje ?? ""] ?? "Fichaje"} · ${diaLocal(c.fechaHora)}`
                    : "Corrección"}
                </span>
                <Badge tone={TONO[c.estado]}>{c.estado.toLowerCase()}</Badge>
              </div>
              {c.estado === "RECHAZADA" && c.comentario && (
                <p className="text-xs italic text-slate-500 dark:text-[#94a19c]">“{c.comentario}”</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal === "correccion" && (
        <ModalCorreccion
          onClose={() => setModal(null)}
          onListo={() => {
            setModal(null);
            cargar();
          }}
        />
      )}
      {modal === "ausencia" && (
        <ModalAusencia
          onClose={() => setModal(null)}
          onListo={() => {
            setModal(null);
            cargar();
          }}
        />
      )}
    </Card>
  );
}

const CON_ARTICULO: Record<string, string> = {
  ENTRADA: "la entrada",
  SALIDA: "la salida",
  DESCANSO_INICIO: "el inicio del descanso",
  DESCANSO_FIN: "la vuelta del descanso",
};

export type FichajeACorregir = { id: string; tipo: string; timestamp: string };

const horaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Pedir una corrección. Sin `fichaje`, es agregar uno que faltó; con un
 * fichaje de la lista, es cambiarle la hora o pedir que lo borren porque se
 * marcó sin querer.
 */
export function ModalCorreccion({
  onClose,
  onListo,
  fichaje,
}: {
  onClose: () => void;
  onListo: () => void;
  fichaje?: FichajeACorregir;
}) {
  const [accion, setAccion] = useState<"MODIFICAR" | "ELIMINAR">("MODIFICAR");
  const [tipoFichaje, setTipoFichaje] = useState(fichaje?.tipo ?? "ENTRADA");
  const [fecha, setFecha] = useState(fichaje ? hoyISODe(fichaje.timestamp) : hoyISO());
  const [hora, setHora] = useState(fichaje ? horaLocal(fichaje.timestamp) : "09:00");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const tipo = fichaje ? accion : "AGREGAR";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);

    const [y, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    const fechaHora = new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();

    try {
      const res = await fetch("/api/correcciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          fichajeId: fichaje?.id,
          ...(tipo === "ELIMINAR" ? {} : { tipoFichaje, fechaHora }),
          motivo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "No se pudo enviar");
      onListo();
    } catch {
      setError("No pudimos enviarla. Revisá la conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const titulo = fichaje
    ? `Corregir ${CON_ARTICULO[fichaje.tipo] ?? "el fichaje"} de las ${horaLocal(fichaje.timestamp)}`
    : "Agregar un fichaje que faltó";

  return (
    <Modal title={titulo} onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          {fichaje
            ? "Tu encargado lo revisa y, si lo aprueba, se corrige solo."
            : "Si te olvidaste de fichar, pedí que lo agreguen. Tu encargado lo tiene que aprobar."}
        </p>

        {fichaje && (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Qué querés corregir</legend>
            {(
              [
                ["MODIFICAR", "La hora está mal"],
                ["ELIMINAR", "Lo marqué sin querer"],
              ] as const
            ).map(([valor, texto]) => (
              <label
                key={valor}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-sm font-semibold transition-colors ${
                  accion === valor
                    ? "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-[#37e6b0] dark:bg-[#0f2620] dark:text-[#cdfbea]"
                    : "border-slate-200 text-slate-600 dark:border-[#29403b] dark:text-[#c1cbc6]"
                }`}
              >
                <input
                  type="radio"
                  name="accion"
                  value={valor}
                  checked={accion === valor}
                  onChange={() => setAccion(valor)}
                  className="sr-only"
                />
                {texto}
              </label>
            ))}
          </fieldset>
        )}

        {tipo !== "ELIMINAR" && (
          <>
            <div>
              <Label>{fichaje ? "Qué fichaje era" : "Qué fichaje falta"}</Label>
              <Select value={tipoFichaje} onChange={(e) => setTipoFichaje(e.target.value)}>
                <option value="ENTRADA">Entrada</option>
                <option value="SALIDA">Salida</option>
                <option value="DESCANSO_INICIO">Inicio de descanso</option>
                <option value="DESCANSO_FIN">Fin de descanso</option>
              </Select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Fecha</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required disabled={Boolean(fichaje)} />
              </div>
              <div className="flex-1">
                <Label>{fichaje ? "Hora correcta" : "Hora"}</Label>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
              </div>
            </div>
          </>
        )}
        <div>
          <Label>Qué pasó</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === "ELIMINAR" ? "Toqué dos veces el botón" : "Me quedé sin batería"}
            required
          />
        </div>
        <Button type="submit" disabled={enviando}>
          <Plus size={16} />
          {enviando ? "Enviando…" : "Enviar al encargado"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}

function ModalAusencia({ onClose, onListo }: { onClose: () => void; onListo: () => void }) {
  const [tipo, setTipo] = useState("VACACIONES");
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [certificado, setCertificado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      setCertificado(await achicarImagen(file));
    } catch {
      setError("No se pudo procesar la foto. Probá con otra.");
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const res = await fetch("/api/ausencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, desde, hasta, motivo, certificado }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo enviar");
    onListo();
  }

  return (
    <Modal title="Pedir ausencia" onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <div>
          <Label>Tipo</Label>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="VACACIONES">Vacaciones</option>
            <option value="ENFERMEDAD">Enfermedad</option>
            <option value="FRANCO">Franco</option>
            <option value="LICENCIA">Licencia</option>
            <option value="OTRO">Otro</option>
          </Select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
          </div>
          <div className="flex-1">
            <Label>Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label>Comentario (opcional)</Label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Turno médico" />
        </div>
        <div>
          <Label>Certificado (opcional)</Label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-[#26312d] dark:text-[#94a19c]">
            <Camera size={16} />
            {certificado ? "Foto lista — tocá para cambiarla" : "Sacar o elegir una foto"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFoto} />
          </label>
          {certificado && (
            // eslint-disable-next-line @next/next/no-img-element -- previsualización de un data URL local
            <img src={certificado} alt="Certificado" className="mt-2 max-h-40 rounded-lg object-contain" />
          )}
        </div>
        <Button type="submit" disabled={enviando}>
          <Plus size={16} />
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
