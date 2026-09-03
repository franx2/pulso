"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { abrirCamara, capturarRostro, cerrarCamara } from "@/lib/rostroCliente";

export type ResultadoVerificacion = {
  rostroDescriptor?: number[];
  rostroFoto?: string;
  rostroMotivo?: string;
};

type Estado = "abriendo" | "detectando" | "ok" | "sin_rostro" | "varios_rostros" | "sin_camara";

const MENSAJE: Record<Estado, string> = {
  abriendo: "Abriendo la cámara…",
  detectando: "Mirá a la cámara y quedate quieto…",
  ok: "¡Listo, sos vos!",
  sin_rostro: "No te vimos bien la cara.",
  varios_rostros: "Hay más de una persona en cuadro.",
  sin_camara: "No pudimos usar la cámara. Fichamos sin verificar.",
};

/**
 * Modal de verificación facial al fichar: cámara y cara visibles en pantalla,
 * como pidió el dueño ("que muestre la cámara y la cara"). Captura sola a los
 * pocos segundos; si falla, ofrece un botón "Reintentar" antes del auto-cierre
 * (manos mojadas/guantes, mal encuadre por un instante no deberían costar el
 * único intento).
 *
 * Nunca bloquea: ante cualquier falla resuelve con un motivo y el fichaje
 * sigue su curso (el encargado lo ve marcado para revisar).
 */
export default function VerificarRostroModal({
  onTerminado,
}: {
  onTerminado: (r: ResultadoVerificacion) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const autoCierre = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [estado, setEstado] = useState<Estado>("abriendo");
  // Evita depender de `onTerminado` en el efecto de la cámara, que debe
  // correr una sola vez: se sincroniza en su propio efecto, nunca en el render.
  const onTerminadoRef = useRef(onTerminado);
  useEffect(() => {
    onTerminadoRef.current = onTerminado;
  }, [onTerminado]);

  async function intentarCaptura(cancelado: () => boolean) {
    if (autoCierre.current) clearTimeout(autoCierre.current);
    setEstado("detectando");
    const captura = video.current ? await capturarRostro(video.current) : null;
    if (cancelado()) return;

    if (captura?.ok) {
      setEstado("ok");
      autoCierre.current = setTimeout(
        () => onTerminadoRef.current({ rostroDescriptor: captura.descriptor, rostroFoto: captura.foto }),
        500
      );
      return;
    }

    const motivo = captura?.motivo;
    setEstado(motivo === "VARIOS_ROSTROS" ? "varios_rostros" : "sin_rostro");
    autoCierre.current = setTimeout(
      () =>
        onTerminadoRef.current({
          rostroFoto: captura?.foto ?? undefined,
          rostroMotivo: motivo === "ERROR" ? "OMITIDA" : "SIN_ROSTRO",
        }),
      2200
    );
  }

  useEffect(() => {
    let cancelado = false;
    const yaCancelado = () => cancelado;

    (async () => {
      const s = await abrirCamara();
      if (cancelado) return cerrarCamara(s);
      if (!s) {
        setEstado("sin_camara");
        autoCierre.current = setTimeout(() => onTerminadoRef.current({ rostroMotivo: "OMITIDA" }), 1100);
        return;
      }

      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        try {
          await video.current.play();
        } catch {
          // Ignorado: si no arranca, el capturarRostro de abajo lo detecta.
        }
      }

      // La cámara recién abierta tarda un instante en enfocar y exponer bien.
      await new Promise((r) => setTimeout(r, 900));
      if (cancelado) return;
      await intentarCaptura(yaCancelado);
    })();

    return () => {
      cancelado = true;
      if (autoCierre.current) clearTimeout(autoCierre.current);
      cerrarCamara(stream.current);
    };
  }, []);

  const ok = estado === "ok";
  const reintentable = estado === "sin_rostro" || estado === "varios_rostros";
  const fallo = reintentable || estado === "sin_camara";

  return (
    <Modal
      title="Verificando tu identidad"
      onClose={() => onTerminadoRef.current({ rostroMotivo: "OMITIDA" })}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full overflow-hidden rounded-2xl bg-slate-900">
          <video ref={video} playsInline muted className="h-72 w-full -scale-x-100 object-cover" />

          {/* Guía ovalada para encuadrar la cara. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-52 w-44 rounded-[50%] border-4 transition-colors ${
                ok
                  ? "border-emerald-400"
                  : fallo
                    ? "border-red-400"
                    : "border-white/70"
              }`}
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
            />
          </div>

          {estado === "abriendo" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera size={32} className="animate-pulse text-white/70" />
            </div>
          )}
        </div>

        <div
          className={`flex items-center gap-2 text-sm font-medium ${
            ok
              ? "text-emerald-700 dark:text-[#4ee6b0]"
              : fallo
                ? "text-red-600 dark:text-red-400"
                : "text-slate-600 dark:text-[#c1cbc6]"
          }`}
        >
          {ok && <CheckCircle2 size={17} />}
          {fallo && <XCircle size={17} />}
          {MENSAJE[estado]}
        </div>

        {reintentable && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => intentarCaptura(() => false)}
          >
            <RotateCcw size={16} />
            Reintentar
          </Button>
        )}
      </div>
    </Modal>
  );
}
