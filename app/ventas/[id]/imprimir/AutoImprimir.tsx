"use client";

import { useEffect } from "react";

/** Abre el diálogo de impresión al cargar y cierra la ventana al terminar. */
export default function AutoImprimir() {
  useEffect(() => {
    const cerrar = () => {
      if (window.opener) window.close();
    };
    window.addEventListener("afterprint", cerrar);
    const t = setTimeout(() => window.print(), 250);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", cerrar);
    };
  }, []);
  return null;
}
