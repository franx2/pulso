"use client";

import { useEffect, useRef, useState } from "react";
import { ScanFace, ShieldCheck } from "lucide-react";
import { abrirCamara, capturarRostro, cerrarCamara } from "@/lib/rostroCliente";
import { Button, Card, Checkbox, ErrorText, Modal, SectionTitle } from "@/components/ui";

const MENSAJE = {
  SIN_ROSTRO: "No se detectó ninguna cara. Buscá mejor luz y mirá de frente.",
  VARIOS_ROSTROS: "Hay más de una persona en cuadro. Tenés que estar solo vos.",
  ERROR: "No se pudo procesar la imagen. Probá de nuevo.",
} as const;

export default function RegistrarRostro({
  registrado,
  onListo,
}: {
  registrado: boolean;
  onListo: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Card className="w-full max-w-xs">
      <SectionTitle>Reconocimiento facial</SectionTitle>
      <p className="mb-3 text-sm text-slate-500 dark:text-[#94a19c]">
        {registrado
          ? "Tu rostro está registrado. Al fichar, la cámara confirma que sos vos."
          : "Para fichar necesitás registrar tu rostro una vez."}
      </p>
      <Button variant={registrado ? "ghost" : "primary"} className="w-full" onClick={() => setAbierto(true)}>
        <ScanFace size={16} />
        {registrado ? "Volver a registrar mi rostro" : "Registrar mi rostro"}
      </Button>

      {abierto && (
        <ModalRegistro
          onClose={() => setAbierto(false)}
          onListo={() => {
            setAbierto(false);
            onListo();
          }}
        />
      )}
    </Card>
  );
}

function ModalRegistro({ onClose, onListo }: { onClose: () => void; onListo: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [consiente, setConsiente] = useState(false);
  const [listaCamara, setListaCamara] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    abrirCamara().then((s) => {
      if (cancelado) return cerrarCamara(s);
      if (!s) return setError("No pudimos abrir la cámara. Revisá los permisos del navegador.");
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        video.current.play().catch(() => {});
      }
      setListaCamara(true);
    });
    return () => {
      cancelado = true;
      cerrarCamara(stream.current);
    };
  }, []);

  async function registrar() {
    if (!video.current) return;
    setError("");
    setProcesando(true);

    const captura = await capturarRostro(video.current);
    if (!captura.ok) {
      setError(MENSAJE[captura.motivo]);
      setProcesando(false);
      return;
    }

    const res = await fetch("/api/rostro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor: captura.descriptor, foto: captura.foto, consiente: true }),
    });
    const data = await res.json();
    setProcesando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo registrar");

    cerrarCamara(stream.current);
    onListo();
  }

  return (
    <Modal title="Registrar mi rostro" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-xl bg-slate-900">
          {/* El espejo hace que moverse a la izquierda se vea a la izquierda. */}
          <video ref={video} playsInline muted className="h-56 w-full -scale-x-100 object-cover" />
        </div>

        <p className="text-sm text-slate-500 dark:text-[#94a19c]">
          Mirá de frente, con buena luz y sin gorro ni barbijo. Sacamos una foto y guardamos una
          huella matemática de tu cara.
        </p>

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-[#26312d]">
          <Checkbox
            className="mt-1"
            checked={consiente}
            onChange={(e) => setConsiente(e.target.checked)}
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck size={14} />
              Autorizo el uso de mi rostro
            </span>
            <span className="mt-0.5 block text-slate-500 dark:text-[#94a19c]">
              Acepto que la empresa registre y procese mi rostro con el único fin de validar mis
              fichajes. Puedo pedir que se borre cuando quiera.
            </span>
          </span>
        </label>

        <Button onClick={registrar} disabled={!listaCamara || !consiente || procesando}>
          <ScanFace size={16} />
          {procesando ? "Procesando…" : "Registrar mi rostro"}
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
