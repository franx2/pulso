"use client";

import type * as FaceApi from "@vladmandic/face-api";

/**
 * Reconocimiento facial en el navegador.
 *
 * Los modelos pesan ~6.5 MB y se cargan una sola vez por dispositivo (después
 * quedan en la caché del navegador). Se importan de forma perezosa para que
 * quien no use esta pantalla no los descargue nunca.
 */

let faceapi: typeof FaceApi | null = null;
let cargando: Promise<typeof FaceApi> | null = null;

async function cargarModelos(): Promise<typeof FaceApi> {
  if (faceapi) return faceapi;
  if (cargando) return cargando;

  cargando = (async () => {
    const api = await import("@vladmandic/face-api");
    await Promise.all([
      api.nets.tinyFaceDetector.loadFromUri("/models"),
      api.nets.faceLandmark68TinyNet.loadFromUri("/models"),
      api.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
    faceapi = api;
    return api;
  })();

  return cargando;
}

export type ResultadoCaptura =
  | { ok: true; descriptor: number[]; foto: string }
  | { ok: false; motivo: "SIN_ROSTRO" | "VARIOS_ROSTROS" | "ERROR"; foto: string | null };

/**
 * Saca una foto del video y calcula el descriptor de la cara.
 *
 * Rechaza si hay más de una cara en cuadro: si el compañero está al lado, no
 * queremos que el sistema elija convenientemente cuál mirar.
 */
export async function capturarRostro(
  fuente: HTMLVideoElement | HTMLImageElement
): Promise<ResultadoCaptura> {
  let foto: string | null = null;
  try {
    const api = await cargarModelos();

    const esVideo = fuente instanceof HTMLVideoElement;
    const canvas = document.createElement("canvas");
    canvas.width = esVideo ? fuente.videoWidth : fuente.naturalWidth;
    canvas.height = esVideo ? fuente.videoHeight : fuente.naturalHeight;
    if (canvas.width === 0 || canvas.height === 0) {
      return { ok: false, motivo: "ERROR", foto: null };
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, motivo: "ERROR", foto: null };
    ctx.drawImage(fuente, 0, 0);
    foto = canvas.toDataURL("image/jpeg", 0.75);

    const detecciones = await api
      .detectAllFaces(canvas, new api.TinyFaceDetectorOptions({ inputSize: 320 }))
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    if (detecciones.length === 0) return { ok: false, motivo: "SIN_ROSTRO", foto };
    if (detecciones.length > 1) return { ok: false, motivo: "VARIOS_ROSTROS", foto };

    return { ok: true, descriptor: Array.from(detecciones[0].descriptor), foto };
  } catch (e) {
    console.error("Error al analizar el rostro:", e);
    return { ok: false, motivo: "ERROR", foto };
  }
}

/** Enciende la cámara frontal. Devuelve null si no hay permiso o cámara. */
export async function abrirCamara(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch {
    return null;
  }
}

export function cerrarCamara(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Deja los modelos listos para que el primer fichaje no espere la descarga. */
export function precargarModelos() {
  cargarModelos().catch(() => {});
}
