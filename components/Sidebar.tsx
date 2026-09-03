"use client";

import Link from "next/link";
import { ITEMS, RANGO, type NavActivo } from "@/components/BottomNav";
import type { Rol } from "@/lib/session";

/** Nav de escritorio para encargado/admin — el bottom-nav mobile no sirve para
 * planificar turnos o reportes desde una notebook. */
export function Sidebar({ active, rol }: { active: NavActivo; rol: Rol }) {
  const visibles = ITEMS.filter((i) => RANGO[rol] >= RANGO[i.minimo]);
  if (visibles.length < 2) return null;

  return (
    <aside className="sticky top-6 hidden h-fit w-52 shrink-0 flex-col gap-1 md:flex">
      {visibles.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412] ${
            active === i.key
              ? "bg-emerald-700 text-white shadow-sm dark:bg-[#1d4e48] dark:text-[#37e6b0]"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4]"
          }`}
        >
          <i.Icon size={18} strokeWidth={2.3} />
          {i.label}
        </Link>
      ))}
    </aside>
  );
}
