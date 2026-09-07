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
            ? // El rail es `fixed` y se agranda de 72px a 240px al pasar el mouse
              // o enfocarlo; sin este margen creciendo junto con él, el flyout
              // tapaba 168px de contenido y cortaba el título de la pantalla a
              // la mitad ("Compras y consumo" se leía "s y consumo").
              "pt-5 sm:pt-6 md:ml-18 md:w-auto md:max-w-none md:px-8 md:pt-0 md:transition-[margin-left] md:duration-200 md:ease-out md:peer-hover/sidebar:ml-60 md:peer-focus-within/sidebar:ml-60"
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
