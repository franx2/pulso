import Link from "next/link";

/**
 * El símbolo de siempre —la P compacta con su punto de estado— en los colores
 * de Bianco & Nero: tinta, papel y arena.
 */
function Marca() {
  return (
    <span
      aria-hidden
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-slate-950 text-base font-black leading-none text-[#FDFDFC] shadow-[0_3px_10px_rgba(22,19,17,0.2)]"
    >
      P
      <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-arena-300" />
    </span>
  );
}

export function Brand({
  href = "/",
  centered = false,
  collapsible = false,
}: {
  href?: string;
  centered?: boolean;
  collapsible?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="Pulso Operativo — Bianco & Nero"
      className={`inline-flex items-center gap-3 text-slate-950 ${centered ? "justify-center" : ""}`}
    >
      <Marca />
      <span
        className={`flex flex-col overflow-hidden whitespace-nowrap leading-none ${
          collapsible
            ? "max-w-0 -translate-x-1 opacity-0 transition-[max-width,opacity,transform] duration-200 group-hover/sidebar:max-w-28 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-28 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100"
            : ""
        }`}
      >
        <span className="text-lg font-bold uppercase tracking-[0.18em]">Pulso</span>
        <span className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-arena-700">Bianco & Nero</span>
      </span>
    </Link>
  );
}
