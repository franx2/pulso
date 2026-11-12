"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Brain,
  BarChart3,
  CalendarDays,
  Clock,
  MoreHorizontal,
  LayoutDashboard,
  Settings,
  Truck,
  PieChart,
  Scale,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui";
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
  | "compras"
  | "sectores"
  | "resultado";

type Item = { key: NavActivo; href: string; Icon: LucideIcon; label: string; minimo: Rol; grupo: string };

export const ITEMS: Item[] = [
  { key: "fichar", href: "/fichar", Icon: Clock, label: "Fichar", minimo: "EMPLEADO", grupo: "" },
  { key: "presencia", href: "/admin/presencia", Icon: Activity, label: "Presencia", minimo: "ENCARGADO", grupo: "Operación" },
  { key: "turnos", href: "/admin/turnos", Icon: CalendarDays, label: "Turnos", minimo: "ENCARGADO", grupo: "Operación" },
  { key: "arqueos", href: "/admin/arqueos", Icon: Wallet, label: "Arqueos", minimo: "ENCARGADO", grupo: "Operación" },
  { key: "dashboard", href: "/admin/dashboard", Icon: LayoutDashboard, label: "Comando", minimo: "ADMIN", grupo: "Análisis" },
  { key: "pronostico", href: "/admin/pronostico", Icon: Brain, label: "Pronóstico", minimo: "ADMIN", grupo: "Análisis" },
  { key: "compras", href: "/admin/compras", Icon: Truck, label: "Compras", minimo: "ADMIN", grupo: "Análisis" },
  { key: "sectores", href: "/admin/sectores", Icon: PieChart, label: "Sectores", minimo: "ADMIN", grupo: "Análisis" },
  { key: "resultado", href: "/admin/resultado", Icon: Scale, label: "Resultado", minimo: "ADMIN", grupo: "Análisis" },
  { key: "reportes", href: "/admin/reportes", Icon: BarChart3, label: "Reportes", minimo: "ADMIN", grupo: "Análisis" },
  { key: "empleados", href: "/admin/empleados", Icon: Users, label: "Equipo", minimo: "ADMIN", grupo: "Gestión" },
  { key: "configuracion", href: "/admin/configuracion", Icon: Settings, label: "Ajustes", minimo: "ADMIN", grupo: "Gestión" },
];

export const RANGO: Record<Rol, number> = { EMPLEADO: 0, ENCARGADO: 1, ADMIN: 2 };

/**
 * Los que se quedan siempre a la vista cuando hay más destinos que lugar.
 * Son los de uso diario del admin desde el celular: el estado del negocio,
 * quién está trabajando, los turnos y el resultado.
 */
const PRINCIPALES: NavActivo[] = ["dashboard", "presencia", "turnos", "resultado"];

/** Hasta acá entran todos en la barra, de a un ícono con su etiqueta. */
const MAXIMO_EN_BARRA = 5;

export function BottomNav({ active, rol = "EMPLEADO" }: { active: NavActivo; rol?: Rol }) {
  const [abierto, setAbierto] = useState(false);
  const visibles = ITEMS.filter((i) => RANGO[rol] >= RANGO[i.minimo]);
  if (visibles.length < 2) return null;

  const contenedor =
    "mx-auto flex max-w-lg gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_12px_35px_rgba(15,23,42,0.22)] backdrop-blur dark:border-[#29403b] dark:bg-[#101c19]/95 dark:shadow-[0_14px_38px_rgba(0,0,0,0.5)]";

  // Pocos destinos: todos a la vista, como siempre.
  if (visibles.length <= MAXIMO_EN_BARRA) {
    return (
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 px-3">
        <div className={contenedor}>
          {visibles.map((i) => (
            <NavItem key={i.key} active={active === i.key} href={i.href} Icon={i.Icon} label={i.label} />
          ))}
        </div>
      </nav>
    );
  }

  // Doce destinos en una barra que scrolleaba con la barra de desplazamiento
  // oculta: los últimos siete no existían para quien no sabía que había que
  // deslizar. Cuatro fijos y un "Más" que abre todos, agrupados como en la
  // consola de escritorio.
  const fijos = visibles.filter((i) => PRINCIPALES.includes(i.key));
  const activoEnMas = !fijos.some((i) => i.key === active);
  const grupos = [...new Set(visibles.map((i) => i.grupo))];

  return (
    <>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 px-3">
        <div className={contenedor}>
          {fijos.map((i) => (
            <NavItem key={i.key} active={active === i.key} href={i.href} Icon={i.Icon} label={i.label} />
          ))}
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-haspopup="dialog"
            aria-expanded={abierto}
            className={`${CLASE_ITEM} ${activoEnMas ? CLASE_ACTIVO : CLASE_INACTIVO}`}
          >
            <MoreHorizontal size={20} strokeWidth={2.3} />
            <span className="block truncate text-[11px] font-bold leading-tight">Más</span>
          </button>
        </div>
      </nav>

      {abierto && (
        <Modal title="Ir a" onClose={() => setAbierto(false)}>
          <div className="flex flex-col gap-4">
            {grupos.map((grupo) => (
              <div key={grupo || "general"}>
                {grupo && (
                  <p className="mb-1.5 px-1 text-xs font-semibold uppercase text-slate-500 dark:text-[#94a19c]">{grupo}</p>
                )}
                <div className="flex flex-col gap-1">
                  {visibles
                    .filter((i) => i.grupo === grupo)
                    .map((i) => (
                      <Link
                        key={i.key}
                        href={i.href}
                        onClick={() => setAbierto(false)}
                        aria-current={active === i.key ? "page" : undefined}
                        className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${
                          active === i.key
                            ? "bg-emerald-700 text-white dark:bg-[#1d4e48] dark:text-[#37e6b0]"
                            : "text-slate-700 hover:bg-slate-100 dark:text-[#e0e7e3] dark:hover:bg-[#172724]"
                        }`}
                      >
                        <i.Icon size={20} strokeWidth={2.3} className="shrink-0" aria-hidden />
                        {i.label}
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

const CLASE_ITEM =
  "flex min-h-[58px] min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]";
const CLASE_ACTIVO = "bg-emerald-700 text-white shadow-sm dark:bg-[#1d4e48] dark:text-[#37e6b0]";
const CLASE_INACTIVO =
  "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4]";

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

  const cls = `${CLASE_ITEM} ${active ? CLASE_ACTIVO : CLASE_INACTIVO}`;

  return (
    <Link ref={ref} href={href} className={cls} aria-current={active ? "page" : undefined}>
      <Icon size={20} strokeWidth={2.3} />
      <span className="block truncate text-[11px] font-bold leading-tight">{label}</span>
    </Link>
  );
}
