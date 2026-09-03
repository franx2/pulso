import type { ReactNode } from "react";
import { BottomNav, type NavActivo } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import type { Rol } from "@/lib/session";

export function PageShell({
  children,
  nombre,
  rol,
  nav,
  width = "wide",
}: {
  children: ReactNode;
  nombre?: string;
  rol?: Rol;
  /** Sin `nav` no se muestra la barra inferior. */
  nav?: NavActivo;
  width?: "wide" | "narrow";
}) {
  // Encargado/admin son quienes planifican turnos y miran reportes desde una
  // notebook: en desktop se les da un sidebar propio en vez del bottom-nav
  // pensado para el pulgar del empleado en el celular.
  const conSidebar = Boolean(nav && rol && rol !== "EMPLEADO");

  return (
    <>
      <Header nombre={nombre} />
      <div
        className={`mx-auto flex w-full flex-1 gap-6 px-4 pt-5 sm:pt-6 ${conSidebar ? "max-w-5xl" : "max-w-3xl"}`}
      >
        {conSidebar && <Sidebar active={nav!} rol={rol!} />}
        <main className={`min-w-0 flex-1 ${nav ? "pb-28 md:pb-8" : "pb-8"}`}>
          <div className={width === "narrow" ? "mx-auto w-full max-w-lg" : ""}>{children}</div>
        </main>
      </div>
      {nav && <div className={conSidebar ? "md:hidden" : ""}><BottomNav active={nav} rol={rol} /></div>}
    </>
  );
}
