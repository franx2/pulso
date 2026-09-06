"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ITEMS, RANGO, type NavActivo } from "@/components/BottomNav";
import type { Rol } from "@/lib/session";

const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Admin",
  ENCARGADO: "Encargado",
  EMPLEADO: "Empleado",
};

/** Rail de escritorio para encargado/admin. Permanece compacto y se abre al
 * acercar el puntero o al recibir foco, sin desplazar el área de trabajo. */
export function Sidebar({ active, rol, nombre }: { active: NavActivo; rol: Rol; nombre?: string }) {
  const router = useRouter();
  const visibles = ITEMS.filter((i) => i.grupo && RANGO[rol] >= RANGO[i.minimo]);
  if (visibles.length < 2) return null;

  const grupos = [...new Set(visibles.map((i) => i.grupo))];

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="group/sidebar fixed inset-y-0 left-0 z-30 hidden w-[4.5rem] flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width,box-shadow] duration-200 ease-out hover:w-60 hover:shadow-[8px_0_24px_rgba(15,23,42,0.12)] focus-within:w-60 focus-within:shadow-[8px_0_24px_rgba(15,23,42,0.12)] md:flex dark:border-[#26312d] dark:bg-[#0b1412] dark:hover:shadow-[8px_0_28px_rgba(0,0,0,0.35)] dark:focus-within:shadow-[8px_0_28px_rgba(0,0,0,0.35)]">
      <div className="shrink-0 border-b border-slate-100 px-[1.1rem] py-4 dark:border-[#1c2521]">
        <Brand collapsible />
      </div>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        {grupos.map((grupo) => (
          <div key={grupo} className="mb-2 transition-[margin] duration-200 last:mb-0 group-hover/sidebar:mb-5 group-focus-within/sidebar:mb-5">
            <p className="max-h-0 overflow-hidden whitespace-nowrap px-2.5 text-[11px] font-bold uppercase text-slate-400 opacity-0 transition-[max-height,margin,opacity] duration-200 group-hover/sidebar:mb-1.5 group-hover/sidebar:max-h-5 group-hover/sidebar:opacity-100 group-focus-within/sidebar:mb-1.5 group-focus-within/sidebar:max-h-5 group-focus-within/sidebar:opacity-100 dark:text-[#5d6d67]">
              {grupo}
            </p>
            <div className="flex flex-col gap-0.5">
              {visibles
                .filter((i) => i.grupo === grupo)
                .map((i) => (
                  <Link
                    key={i.key}
                    href={i.href}
                    title={i.label}
                    className={`flex min-h-10 w-full items-center justify-center gap-0 overflow-hidden rounded-lg px-0 text-sm font-semibold transition-[color,background-color,padding,gap] duration-200 group-hover/sidebar:justify-start group-hover/sidebar:gap-2.5 group-hover/sidebar:px-2.5 group-focus-within/sidebar:justify-start group-focus-within/sidebar:gap-2.5 group-focus-within/sidebar:px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412] ${
                      active === i.key
                        ? "bg-emerald-700 text-white shadow-sm dark:bg-[#1d4e48] dark:text-[#37e6b0]"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4]"
                    }`}
                  >
                    <i.Icon size={18} strokeWidth={2.3} className="shrink-0" aria-hidden />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover/sidebar:max-w-36 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-36 group-focus-within/sidebar:opacity-100">
                      {i.label}
                    </span>
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-slate-100 px-3 py-3 transition-[gap] duration-200 group-hover/sidebar:flex-row group-hover/sidebar:justify-between group-hover/sidebar:gap-2 group-focus-within/sidebar:flex-row group-focus-within/sidebar:justify-between group-focus-within/sidebar:gap-2 dark:border-[#1c2521]">
        <div className="max-w-0 min-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover/sidebar:max-w-28 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-28 group-focus-within/sidebar:opacity-100">
          {nombre && <p className="truncate text-sm font-semibold">{nombre}</p>}
          <p className="text-xs text-slate-500 dark:text-[#94a19c]">{ETIQUETA_ROL[rol]}</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 group-hover/sidebar:flex-row group-focus-within/sidebar:flex-row">
          <ThemeToggle />
          <button
            type="button"
            onClick={salir}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-red-300 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]"
          >
            <LogOut size={17} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </aside>
  );
}
