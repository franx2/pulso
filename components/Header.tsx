"use client";

import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Brand } from "@/components/Brand";

export function Header({ nombre, wide = false }: { nombre?: string; wide?: boolean }) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#0b1412]">
      <div className={`mx-auto flex ${wide ? "max-w-5xl" : "max-w-3xl"} items-center justify-between px-4 py-3`}>
        <Brand />
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          {nombre && (
            <>
              <span className="hidden text-slate-500 sm:inline dark:text-[#94a19c]">{nombre}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-10 rounded-lg px-2 text-slate-500 transition hover:bg-slate-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-red-300 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]"
              >
                Salir
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
