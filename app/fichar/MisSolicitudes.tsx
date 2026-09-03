"use client";

import { useEffect, useState } from "react";
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
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function MisSolicitudes() {
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
    cargar();
  }, []);

  const pendientes = [...correcciones, ...ausencias].filter((s) => s.estado === "PENDIENTE").length;

  return (
    <Card className="w-full max-w-xs">
      <SectionTitle
        action={pendientes > 0 ? <Badge tone="amber">{pendientes} pendiente{pendientes === 1 ? "" : "s"}</Badge> : undefined}
      >
        Mis solicitudes
      </SectionTitle>

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 text-xs" onClick={() => setModal("correccion")}>
          <PencilLine size={14} />
          Corregir fichaje
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

function ModalCorreccion({ onClose, onListo }: { onClose: () => void; onListo: () => void }) {
  const [tipoFichaje, setTipoFichaje] = useState("ENTRADA");
  const [fecha, setFecha] = useState(hoyISO());
  const [hora, setHora] = useState("09:00");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);

    const [y, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    const fechaHora = new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();

    const res = await fetch("/api/correcciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "AGREGAR", tipoFichaje, fechaHora, motivo }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo enviar");
    onListo();
  }

  return (
    <Modal title="Corregir un fichaje" onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          Si te olvidaste de fichar, pedí que lo agreguen. El encargado lo tiene que aprobar.
        </p>
        <div>
          <Label>Qué fichaje falta</Label>
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
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="flex-1">
            <Label>Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label>Qué pasó</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Me quedé sin batería"
            required
          />
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
