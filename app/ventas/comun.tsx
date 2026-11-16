"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LayoutGrid, Settings, Wallet } from "lucide-react";

const CLAVE_LOCAL = "pulso.ventas.local";

/** El local en el que se está vendiendo, recordado en este dispositivo. */
export function useLocalVentas(): [string, (id: string) => void] {
  const [localId, setLocalId] = useState("");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leer localStorage recién en el cliente
      setLocalId(localStorage.getItem(CLAVE_LOCAL) ?? "");
    } catch {
      // Sin almacenamiento (modo privado): se elige cada vez.
    }
  }, []);
  function elegir(id: string) {
    setLocalId(id);
    try {
      localStorage.setItem(CLAVE_LOCAL, id);
    } catch {}
  }
  return [localId, elegir];
}

/** "hace 12 min", "1 h 05": cuánto lleva abierta una mesa. */
export function tiempoDesde(iso: string, ahora = Date.now()) {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

/** Abre la página de impresión en una ventana chica, que imprime sola y se cierra. */
export function imprimir(url: string) {
  const w = window.open(url, "_blank", "width=420,height=640");
  if (!w) window.location.href = url;
}

const SECCIONES = [
  { clave: "salon", href: "/ventas", label: "Salón", Icono: LayoutGrid },
  { clave: "caja", href: "/ventas/caja", label: "Caja", Icono: Wallet },
  { clave: "configuracion", href: "/ventas/configuracion", label: "Configuración", Icono: Settings },
] as const;

export function NavVentas({ activo }: { activo: (typeof SECCIONES)[number]["clave"] }) {
  return (
    <nav aria-label="Secciones de ventas" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#29403b] dark:bg-[#0b1412]">
      {SECCIONES.map(({ clave, href, label, Icono }) => (
        <Link
          key={clave}
          href={href}
          aria-current={clave === activo ? "page" : undefined}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
            clave === activo
              ? "bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:bg-[#1d4e48] dark:text-[#f2f7f4]"
              : "text-slate-500 hover:text-slate-900 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
          }`}
        >
          <Icono size={15} aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * Un monto como lo escribe alguien en Argentina: "20.000", "1.500,50", "350".
 * El punto de miles no puede leerse como decimal: "20.000" son veinte mil.
 */
export function aNumero(texto: string): number {
  const t = texto.trim().replace(/\$|\s/g, "");
  if (!t) return 0;
  const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

export const ETIQUETA_MOTIVO: Record<string, string> = {
  PEDIDO_DEL_CLIENTE: "Lo pidió el cliente",
  DEMORA_EN_COCINA: "Demora en cocina",
  ERROR: "Error al cargar",
  CLIENTE_INSATISFECHO: "El cliente no quedó conforme",
  CAMBIO_DE_PRODUCTO: "Cambio de producto",
  SIN_STOCK: "No hay",
  PRUEBA: "Prueba",
  OTRO: "Otro",
};
