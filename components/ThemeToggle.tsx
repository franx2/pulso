"use client";

import { useDarkMode } from "@/components/ui";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { dark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Modo claro" : "Modo oscuro"}
      aria-label="Cambiar tema"
      className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-[#c3d1cb] dark:hover:bg-[#172724] dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]"
    >
      {dark ? <Sun size={19} strokeWidth={2.2} /> : <Moon size={19} strokeWidth={2.2} />}
    </button>
  );
}
