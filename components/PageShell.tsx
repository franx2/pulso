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
  width?: "wide" | "narrow" | "full";
}) {
  // Encargado/admin planifican turnos y miran reportes desde una notebook:
  // en escritorio se les da una consola propia (rail fijo agrupado) en vez
  // del bottom-nav pensado para el pulgar del empleado en el celular. El
  // Header mobile (marca + salir) queda sólo para debajo de `md:`, donde el
  // rail no se muestra.
  const conSidebar = Boolean(nav && rol && rol !== "EMPLEADO");

  return (
    <>
      {conSidebar && <Sidebar active={nav!} rol={rol!} nombre={nombre} />}
      <div className={conSidebar ? "md:hidden" : ""}>
        <Header nombre={nombre} />
      </div>
      <main
        className={`mx-auto w-full flex-1 px-4 sm:px-6 ${
          conSidebar
            ? "pt-5 sm:pt-6 md:ml-60 md:w-[calc(100%-15rem)] md:max-w-none md:px-8 md:pt-0"
            : "max-w-3xl pt-5 sm:pt-6"
        } ${nav ? "pb-28 md:pb-8" : "pb-8"}`}
      >
        <div
          className={
            width === "narrow"
              ? "mx-auto w-full max-w-lg"
              : width === "full"
                ? "mx-auto w-full max-w-[90rem]"
                : conSidebar
                  ? "mx-auto w-full max-w-6xl"
                  : ""
          }
        >
          {children}
        </div>
      </main>
      {nav && <div className={conSidebar ? "md:hidden" : ""}><BottomNav active={nav} rol={rol} /></div>}
    </>
  );
}
