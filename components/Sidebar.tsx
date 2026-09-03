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

/** Consola de escritorio para encargado/admin: rail fijo agrupado por
 * sección, con marca, usuario y salida propios — reemplaza al bottom-nav
 * mobile en vez de convivir con él. */
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
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex dark:border-[#26312d] dark:bg-[#0b1412]">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-[#1c2521]">
        <Brand />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {grupos.map((grupo) => (
          <div key={grupo} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#5d6d67]">
              {grupo}
            </p>
            <div className="flex flex-col gap-0.5">
              {visibles
                .filter((i) => i.grupo === grupo)
                .map((i) => (
                  <Link
                    key={i.key}
                    href={i.href}
                    className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412] ${
                      active === i.key
                        ? "bg-emerald-700 text-white shadow-sm dark:bg-[#1d4e48] dark:text-[#37e6b0]"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4]"
                    }`}
                  >
                    <i.Icon size={17} strokeWidth={2.3} />
                    {i.label}
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-[#1c2521]">
        <div className="min-w-0">
          {nombre && <p className="truncate text-sm font-semibold">{nombre}</p>}
          <p className="text-xs text-slate-500 dark:text-[#94a19c]">{ETIQUETA_ROL[rol]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
