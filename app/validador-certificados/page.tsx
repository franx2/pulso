"use client";

import { useState } from "react";
import Image from "next/image";

/**
 * Réplica visual de "Validador de Certificados" del SIU Guaraní de la
 * Facultad de Ingeniería (UNCuyo) — https://guarani3.ingenieria.uncuyo.edu.ar/g3w3/validador_certificados
 *
 * Es sólo la pantalla: no valida contra ningún dato real, no guarda ni
 * transmite lo que se tipea. Vive fuera de /admin a propósito —sin el menú
 * ni los colores de Pulso Operativo— y no está enlazada desde ningún lado:
 * se llega escribiendo esta ruta directamente.
 *
 * Colores, tipografía y espaciados calcados del sitio real (Bootstrap 2 +
 * Helvetica Neue), no del sistema de diseño de esta app.
 */

const AZUL = "#0088CC";
const AZUL_ACTIVO = "#0088CC";
const GRIS_TEXTO_NAV = "#666666";
const BORDE_INPUT = "#CCCCCC";
const ALERTA_BG = "#D9EDF7";
const ALERTA_BORDE = "#BCE8F1";
const BOTON_BG = "#49AFCD";

const TABS = [
  { label: "Acceso" },
  { label: "Fechas de Examen" },
  { label: "Horarios de Cursadas" },
  { label: "Validador de Certificados", activo: true },
  { label: "Ayuda" },
];

export default function ValidadorCertificadosPage() {
  const [documento, setDocumento] = useState("");
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState("");

  function validar(e: React.FormEvent) {
    e.preventDefault();
    // Maqueta: no hay origen de datos todavía. No se guarda ni se envía nada
    // de lo tipeado a ningún lado.
    setMensaje("Vista previa sin conectar: todavía no hay una base de certificados contra la que validar.");
  }

  return (
    <div style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', background: "#fff", minHeight: "100vh", color: "#333" }}>
      {/* Header: logo */}
      <div style={{ background: "#F7F7F7", padding: "10px 0 15px" }}>
        <div style={{ maxWidth: 1170, margin: "0 auto", padding: "0 20px" }}>
          <Image
            src="/uncuyo/logo-facultad.png"
            alt="UNCUYO — Facultad de Ingeniería"
            width={1131}
            height={176}
            style={{ height: 34, width: "auto" }}
            priority
          />
        </div>
      </div>

      {/* Barra de pestañas */}
      <div style={{ background: "#FAFAFA", borderBottom: "1px solid #D4D4D4", height: 40 }}>
        <div style={{ maxWidth: 1170, margin: "0 auto", padding: "0 20px", display: "flex", height: "100%" }}>
          {TABS.map((t) => (
            <span
              key={t.label}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 15px",
                fontSize: 13,
                lineHeight: "20px",
                background: t.activo ? AZUL_ACTIVO : "transparent",
                color: t.activo ? "#fff" : GRIS_TEXTO_NAV,
                cursor: "default",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth: 1170, margin: "0 auto", padding: "20px" }}>
        <h2
          style={{
            color: AZUL,
            fontWeight: 700,
            fontSize: 24,
            lineHeight: "32px",
            margin: "10px 0",
            paddingBottom: 2,
            borderBottom: "1px solid #EEEEEE",
          }}
        >
          Validador de Certificados
        </h2>

        <div
          style={{
            background: ALERTA_BG,
            border: `1px solid ${ALERTA_BORDE}`,
            borderRadius: 4,
            padding: "8px 14px",
            fontSize: 13,
            color: "#333",
            margin: "20px 0",
          }}
        >
          Ingrese su <strong>Número de Documento</strong>, y luego el <strong>Código de Validación</strong> impreso
          en el certificado.
        </div>

        <form onSubmit={validar} style={{ maxWidth: 400 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 400, marginBottom: 5, color: "#333" }}>
              Número de Documento
            </label>
            <input
              type="text"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              style={{
                width: 206,
                padding: "4px 6px",
                fontSize: 14,
                border: `1px solid ${BORDE_INPUT}`,
                borderRadius: 4,
                color: "#555",
              }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 400, marginBottom: 5, color: "#333" }}>
              Código de Validación
            </label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              style={{
                width: 206,
                padding: "4px 6px",
                fontSize: 14,
                border: `1px solid ${BORDE_INPUT}`,
                borderRadius: 4,
                color: "#555",
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              background: BOTON_BG,
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "4px 12px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Validar
          </button>

          {mensaje && (
            <p style={{ marginTop: 15, fontSize: 13, color: "#8a6d3b", background: "#fcf8e3", border: "1px solid #faebcc", borderRadius: 4, padding: "8px 14px" }}>
              {mensaje}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
