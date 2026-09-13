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

// Precargados para que la demo quede lista para tocar Validar sin tipear nada.
const DOCUMENTO_DEFECTO = "41795738";
const CODIGO_DEFECTO = "26091222274963";

export default function ValidadorCertificadosPage() {
  const [documento, setDocumento] = useState(DOCUMENTO_DEFECTO);
  const [codigo, setCodigo] = useState(CODIGO_DEFECTO);
  // Maqueta: cualquier documento y código cargados dan "válido". No hay
  // origen de datos real todavía, y nada de lo tipeado se guarda ni se envía.
  const [validado, setValidado] = useState(false);

  function validar(e: React.FormEvent) {
    e.preventDefault();
    setValidado(true);
  }

  function volver() {
    setValidado(false);
    setDocumento(DOCUMENTO_DEFECTO);
    setCodigo(CODIGO_DEFECTO);
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

      {/* Barra de pestañas: en un celular las cinco no entran en una línea,
          así que la fila hace scroll horizontal en vez de partir cada
          etiqueta en dos o tres renglones y romper el alto de la barra. */}
      <div style={{ background: "#FAFAFA", borderBottom: "1px solid #D4D4D4", height: 40 }}>
        <div
          className="scrollbar-hidden"
          style={{ maxWidth: 1170, margin: "0 auto", padding: "0 20px", display: "flex", height: "100%", overflowX: "auto" }}
        >
          {TABS.map((t) => (
            <span
              key={t.label}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 15px",
                fontSize: 13,
                lineHeight: "20px",
                whiteSpace: "nowrap",
                flexShrink: 0,
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

        {validado ? (
          <div
            style={{
              background: "#F5F5F5",
              border: "1px solid #E3E3E3",
              borderRadius: 4,
              padding: 19,
              boxShadow: "inset 0 1px 1px rgba(0,0,0,.05)",
            }}
          >
            <h1
              className="text-[28px] sm:text-[40px]"
              style={{
                textAlign: "center",
                fontWeight: 700,
                lineHeight: 1.2,
                color: "#333333",
                margin: "10px 0 20px",
              }}
            >
              Certificado Válido
            </h1>

            <div
              style={{
                background: "#DFF0D8",
                border: "1px solid #D6E9C6",
                borderRadius: 4,
                padding: "8px 14px",
                fontSize: 14,
                color: "#333",
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              El certificado es válido y está vigente
            </div>

            <button
              type="button"
              onClick={volver}
              style={{
                background: "#1B75BC",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "8px 16px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Volver
            </button>
          </div>
        ) : (
          <>
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
              Ingrese su <strong>Número de Documento</strong>, y luego el <strong>Código de Validación</strong>{" "}
              impreso en el certificado.
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
            </form>
          </>
        )}
      </div>
    </div>
  );
}
