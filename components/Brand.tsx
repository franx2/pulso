import Link from "next/link";

/**
 * La marca: un cuadrado partido en blanco y negro —el bianco e nero de la
 * casa— y el nombre en mayúsculas condensadas con aire, como en la web.
 */
export function Marca({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden className="shrink-0">
      <rect x="0.75" y="0.75" width="32.5" height="32.5" fill="#FDFDFC" stroke="#161311" strokeWidth="1.5" />
      <path d="M0 0H17V34H0Z" fill="#161311" />
      <rect x="6" y="15.25" width="22" height="3.5" fill="#D6C69B" />
    </svg>
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
