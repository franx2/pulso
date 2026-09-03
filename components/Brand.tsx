import Link from "next/link";

export function Brand({ href = "/", centered = false }: { href?: string; centered?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Pulso Operativo — Control de personal"
      className={`inline-flex items-center gap-2.5 text-[#115e59] dark:text-[#37e6b0] ${centered ? "justify-center" : ""}`}
    >
      <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-[#0f766e] text-[17px] font-black leading-none text-white shadow-[0_3px_10px_rgba(15,118,110,0.2)] dark:bg-[#134e4a] dark:text-[#f2f7f4] dark:shadow-none">
        P
        <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#37e6b0]" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-xl font-bold">Pulso</span>
        <span className="mt-1 text-[10px] font-semibold text-[#0f766e] dark:text-[#9cefd0]">Operativo</span>
      </span>
    </Link>
  );
}
