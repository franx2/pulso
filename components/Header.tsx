"use client";

import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Brand } from "@/components/Brand";

export function Header({ nombre }: { nombre?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white dark:border-[#26312d] dark:bg-[#0b0e0d]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Brand />
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          {nombre && (
            <>
              <span className="hidden text-slate-500 sm:inline dark:text-[#94a19c]">{nombre}</span>
              <button
                onClick={handleSignOut}
                className="text-slate-500 hover:text-red-600 dark:text-[#94a19c] dark:hover:text-red-300"
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
