"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Activity,
  Brain,
  BarChart3,
  CalendarDays,
  Clock,
  LayoutDashboard,
  Settings,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Rol } from "@/lib/session";

export type NavActivo =
  | "fichar"
  | "presencia"
  | "empleados"
  | "turnos"
  | "reportes"
  | "configuracion"
  | "arqueos"
  | "dashboard"
  | "pronostico"
  | "compras";

type Item = { key: NavActivo; href: string; Icon: LucideIcon; label: string; minimo: Rol; grupo: string };

export const ITEMS: Item[] = [
  { key: "fichar", href: "/fichar", Icon: Clock, label: "Fichar", minimo: "EMPLEADO", grupo: "" },
  { key: "presencia", href: "/admin/presencia", Icon: Activity, label: "Presencia", minimo: "ENCARGADO", grupo: "Operación" },
  { key: "turnos", href: "/admin/turnos", Icon: CalendarDays, label: "Turnos", minimo: "ENCARGADO", grupo: "Operación" },
  { key: "arqueos", href: "/admin/arqueos", Icon: Wallet, label: "Arqueos", minimo: "ENCARGADO", grupo: "Operación" },
  { key: "dashboard", href: "/admin/dashboard", Icon: LayoutDashboard, label: "Comando", minimo: "ADMIN", grupo: "Análisis" },
  { key: "pronostico", href: "/admin/pronostico", Icon: Brain, label: "Pronóstico", minimo: "ADMIN", grupo: "Análisis" },
  { key: "compras", href: "/admin/compras", Icon: Truck, label: "Compras", minimo: "ADMIN", grupo: "Análisis" },
  { key: "reportes", href: "/admin/reportes", Icon: BarChart3, label: "Reportes", minimo: "ADMIN", grupo: "Análisis" },
  { key: "empleados", href: "/admin/empleados", Icon: Users, label: "Equipo", minimo: "ADMIN", grupo: "Gestión" },
  { key: "configuracion", href: "/admin/configuracion", Icon: Settings, label: "Ajustes", minimo: "ADMIN", grupo: "Gestión" },
];

export const RANGO: Record<Rol, number> = { EMPLEADO: 0, ENCARGADO: 1, ADMIN: 2 };

export function BottomNav({ active, rol = "EMPLEADO" }: { active: NavActivo; rol?: Rol }) {
  const visibles = ITEMS.filter((i) => RANGO[rol] >= RANGO[i.minimo]);
  if (visibles.length < 2) return null;

  return (
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 px-3">
      <div className="scrollbar-hidden mx-auto flex max-w-lg gap-1 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_12px_35px_rgba(15,23,42,0.22)] backdrop-blur dark:border-[#29403b] dark:bg-[#101c19]/95 dark:shadow-[0_14px_38px_rgba(0,0,0,0.5)]">
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
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
  }, [active]);

  const cls = `flex min-h-[58px] min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412] ${
    active
      ? "bg-emerald-700 text-white shadow-sm dark:bg-[#1d4e48] dark:text-[#37e6b0]"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4]"
  }`;

  return (
    <Link ref={ref} href={href} className={cls}>
      <Icon size={20} strokeWidth={2.3} />
      <span className="block truncate text-[10px] font-bold leading-tight">{label}</span>
    </Link>
  );
}
