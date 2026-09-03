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
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            active === i.key
              ? "bg-emerald-700 text-white shadow-sm dark:bg-[#173e32] dark:text-[#4ee6b0]"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#94a19c] dark:hover:bg-[#18201d] dark:hover:text-[#f4f7f6]"
          }`}
        >
          <i.Icon size={18} strokeWidth={2.3} />
          {i.label}
        </Link>
      ))}
    </aside>
  );
}
