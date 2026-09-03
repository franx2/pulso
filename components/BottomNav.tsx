"use client";

import Link from "next/link";
import { Activity, BarChart3, CalendarDays, Clock, Settings, Users, type LucideIcon } from "lucide-react";
import type { Rol } from "@/lib/session";

export type NavActivo = "fichar" | "presencia" | "empleados" | "turnos" | "reportes" | "configuracion";

type Item = { key: NavActivo; href: string; Icon: LucideIcon; label: string; minimo: Rol };

export const ITEMS: Item[] = [
  { key: "fichar", href: "/fichar", Icon: Clock, label: "Fichar", minimo: "EMPLEADO" },
  { key: "presencia", href: "/admin/presencia", Icon: Activity, label: "Presencia", minimo: "ENCARGADO" },
  { key: "turnos", href: "/admin/turnos", Icon: CalendarDays, label: "Turnos", minimo: "ENCARGADO" },
  { key: "empleados", href: "/admin/empleados", Icon: Users, label: "Equipo", minimo: "ADMIN" },
  { key: "reportes", href: "/admin/reportes", Icon: BarChart3, label: "Reportes", minimo: "ADMIN" },
  { key: "configuracion", href: "/admin/configuracion", Icon: Settings, label: "Ajustes", minimo: "ADMIN" },
];

export const RANGO: Record<Rol, number> = { EMPLEADO: 0, ENCARGADO: 1, ADMIN: 2 };

export function BottomNav({ active, rol = "EMPLEADO" }: { active: NavActivo; rol?: Rol }) {
  const visibles = ITEMS.filter((i) => RANGO[rol] >= RANGO[i.minimo]);
  if (visibles.length < 2) return null;

  return (
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 px-3">
      <div
        className="mx-auto grid max-w-lg gap-1 rounded-[1.75rem] border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_12px_35px_rgba(15,23,42,0.22)] backdrop-blur dark:border-[#26312d] dark:bg-[#111513]/95 dark:shadow-[0_14px_38px_rgba(0,0,0,0.5)]"
        style={{ gridTemplateColumns: `repeat(${visibles.length}, minmax(0, 1fr))` }}
      >
        {visibles.map((i) => (
          <NavItem key={i.key} active={active === i.key} href={i.href} Icon={i.Icon} label={i.label} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  active,
  href,
  Icon,
  label,
}: {
  active: boolean;
  href: string;
  Icon: LucideIcon;
  label: string;
}) {
  const cls = `flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 text-center transition ${
    active
      ? "bg-emerald-700 text-white shadow-sm dark:bg-[#173e32] dark:text-[#4ee6b0]"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-[#94a19c] dark:hover:bg-[#18201d] dark:hover:text-[#f4f7f6]"
  }`;

  return (
    <Link href={href} className={cls}>
      <Icon size={20} strokeWidth={2.3} />
      <span className="block truncate text-[10px] font-bold leading-tight">{label}</span>
    </Link>
  );
}
