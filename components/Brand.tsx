import Link from "next/link";

export function Brand({ href = "/", centered = false }: { href?: string; centered?: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Jumbo — Control de personal"
      className={`inline-flex items-center gap-2 text-emerald-800 dark:text-[#4ee6b0] ${centered ? "justify-center" : ""}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-sm font-black leading-none text-white shadow-sm dark:bg-[#173e32] dark:text-[#4ee6b0] dark:shadow-none">
        J
      </span>
      <span className="text-xl font-bold tracking-normal">Jumbo</span>
    </Link>
  );
}
