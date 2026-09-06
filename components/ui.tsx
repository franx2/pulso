"use client";

import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { TrendingDown, TrendingUp, X } from "lucide-react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]";
  const variants = {
    primary:
      "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-[#37e6b0] dark:text-[#062419] dark:hover:bg-[#7bf0ca]",
    ghost: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#e0e7e3] dark:hover:bg-[#172724]",
    danger:
      "bg-white text-red-600 border border-red-200 hover:bg-red-50 dark:border-[#5a2f35] dark:bg-[#101c19] dark:hover:bg-red-950/30",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#f2f7f4] dark:focus:border-[#37e6b0] dark:focus:ring-[#1d4e48] ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#f2f7f4] dark:focus:border-[#37e6b0] dark:focus:ring-[#1d4e48] ${className}`}
      {...props}
    />
  );
}

export function Checkbox({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 shrink-0 cursor-pointer accent-emerald-600 dark:accent-[#37e6b0] ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#29403b] dark:bg-[#101c19] dark:text-[#f2f7f4] dark:focus:border-[#37e6b0] dark:focus:ring-[#1d4e48] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#29403b] dark:bg-[#101c19] dark:shadow-none ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{children}</label>;
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
    </div>
  );
}

export function PageTitle({
  children,
  subtitle,
  actions,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F6F8F5]/95 px-4 py-3.5 backdrop-blur-sm supports-backdrop-blur:bg-[#F6F8F5]/85 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 dark:border-[#26312d] dark:bg-[#0B1412]/95 dark:supports-backdrop-blur:bg-[#0B1412]/85">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
          {children}
        </h1>
        {subtitle && <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500 dark:text-[#94a19c]">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  if (!action) {
    return <p className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{children}</p>;
  }
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{children}</p>
      {action}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm font-medium text-red-600 dark:text-red-400">{children}</p>;
}

export function EmptyState({ children, inCard = true }: { children: ReactNode; inCard?: boolean }) {
  const text = <p className="text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>;
  return inCard ? <Card>{text}</Card> : text;
}

export function IconButton({
  label,
  tone = "danger",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "danger" | "default";
  children: ReactNode;
}) {
  const tones = {
    danger: "text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400",
    default: "text-slate-300 hover:text-emerald-600 dark:text-slate-600 dark:hover:text-[#37e6b0]",
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412] ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "emerald",
}: {
  children: ReactNode;
  tone?: "emerald" | "amber" | "rose" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4">
      <div
        className={`max-h-[85vh] w-full ${maxWidth} overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-[#0b1412] sm:rounded-2xl`}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 dark:border-[#29403b] dark:bg-[#0b1412]">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:text-[#b0c3bc] dark:hover:bg-[#172724] dark:hover:text-[#f2f7f4] dark:focus-visible:ring-[#37e6b0] dark:focus-visible:ring-offset-[#0b1412]"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.3} />
          </button>
        </div>
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">{children}</div>
      </div>
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  infoOnly?: boolean;
  onConfirm?: () => void | Promise<void>;
};

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (!request) return;
    if (!request.onConfirm) return setRequest(null);
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
      setRequest(null);
    }
  }

  const dialog = request ? (
    <Modal title={request.title} onClose={() => (busy ? undefined : setRequest(null))}>
      {request.message && <div className="text-sm text-slate-600 dark:text-slate-300">{request.message}</div>}
      <div className="mt-5 flex justify-end gap-2">
        {!request.infoOnly && (
          <Button variant="ghost" onClick={() => setRequest(null)} disabled={busy}>
            Cancelar
          </Button>
        )}
        <Button
          variant={request.tone === "danger" ? "danger" : "primary"}
          onClick={request.infoOnly ? () => setRequest(null) : accept}
          disabled={busy}
        >
          {busy ? "Procesando…" : request.infoOnly ? "Entendido" : (request.confirmLabel ?? "Confirmar")}
        </Button>
      </div>
    </Modal>
  ) : null;

  return { confirm: setRequest, dialog };
}

export type ThemeMode = "auto" | "light" | "dark";

function storedThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" || saved === "auto" ? saved : "auto";
  } catch {
    return "auto";
  }
}

export function useDarkMode() {
  const [dark, setDark] = useState(false);
  const [mode, setThemeMode] = useState<ThemeMode>("auto");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const nextMode = storedThemeMode();
      const nextDark = nextMode === "dark" || (nextMode === "auto" && media.matches);
      setThemeMode(nextMode);
      setDark(nextDark);
      document.documentElement.classList.toggle("dark", nextDark);
    };
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      if (storedThemeMode() !== "auto") return;
      setDark(event.matches);
      document.documentElement.classList.toggle("dark", event.matches);
    };
    sync();
    media.addEventListener("change", onSystemThemeChange);
    window.addEventListener("controlpersonal-theme-change", sync);
    return () => {
      media.removeEventListener("change", onSystemThemeChange);
      window.removeEventListener("controlpersonal-theme-change", sync);
    };
  }, []);

  function setMode(nextMode: ThemeMode) {
    const nextDark = nextMode === "dark" || (nextMode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setThemeMode(nextMode);
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      localStorage.setItem("theme", nextMode);
    } catch {
      // Modo privado o navegador sin storage disponible.
    }
    window.dispatchEvent(new Event("controlpersonal-theme-change"));
  }

  function toggle() {
    setMode(dark ? "light" : "dark");
  }

  return { dark, mode, setMode, toggle };
}

/**
 * Panel analítico: plano, borde fino, esquinas de 8px.
 *
 * Distinto de `Card`, que es la tarjeta heredada de 12px con sombra y que
 * sigue en las pantallas de operación. Estaba redeclarado igual en tres
 * clientes de análisis; ahora es uno solo.
 */
export function Panel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white dark:border-[#29403b] dark:bg-[#101c19] ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

/** Encabezado de panel: título, explicación y una cifra o acción a la derecha. */
export function PanelHeader({
  titulo,
  descripcion,
  action,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-[#1c2521]">
      <div className="min-w-0">
        <h2 className="font-semibold text-slate-950 dark:text-[#f2f7f4]">{titulo}</h2>
        {descripcion && (
          <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500 dark:text-[#94a19c]">{descripcion}</p>
        )}
      </div>
      {action && <div className="shrink-0 text-right">{action}</div>}
    </div>
  );
}

/**
 * Control segmentado para elegir un modo. Estaba copiado en tres pantallas con
 * tres alturas distintas; el mismo control tiene que verse igual en todas.
 */
export function SelectorSegmentado<T extends string | number>({
  opciones,
  valor,
  onChange,
  label,
}: {
  opciones: { clave: T; label: string }[];
  valor: T;
  onChange: (valor: T) => void;
  label: string;
}) {
  return (
    <div
      className="scrollbar-hidden inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#29403b] dark:bg-[#0b1412]"
      role="tablist"
      aria-label={label}
    >
      {opciones.map((opcion) => (
        <button
          key={String(opcion.clave)}
          type="button"
          role="tab"
          aria-selected={valor === opcion.clave}
          onClick={() => onChange(opcion.clave)}
          className={`min-h-8 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${
            valor === opcion.clave
              ? "bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:bg-[#1d4e48] dark:text-[#f2f7f4]"
              : "text-slate-500 hover:text-slate-900 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
          }`}
        >
          {opcion.label}
        </button>
      ))}
    </div>
  );
}


/**
 * Variación contra el período anterior.
 *
 * `null` NO se dibuja como 0%: es "no se puede comparar", que es distinto de
 * "no cambió". Confundirlos ya produjo tres bugs en este proyecto.
 */
export function Delta({ valor, texto = "vs. período anterior" }: { valor: number | null; texto?: string }) {
  if (valor == null) {
    return <span className="text-xs text-slate-400 dark:text-[#74817b]">sin base comparable</span>;
  }
  const sube = valor >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        sube ? "text-emerald-700 dark:text-[#4ee6b0]" : "text-rose-600 dark:text-rose-400"
      }`}
    >
      <Icono size={13} aria-hidden />
      {sube ? "+" : ""}
      {valor.toFixed(1)}% {texto}
    </span>
  );
}

/**
 * Una cifra de la banda métrica.
 *
 * `nota` es para contexto y `delta` para una variación; nunca los dos, porque
 * la línea de abajo tiene una sola altura reservada y dos cosas ahí se pisan.
 */
export function Metrica({
  label,
  valor,
  valorCompleto,
  nota,
  delta,
  textoDelta,
  tono = "normal",
}: {
  label: string;
  valor: string;
  valorCompleto?: string;
  nota?: ReactNode;
  delta?: number | null;
  textoDelta?: string;
  tono?: "normal" | "positivo" | "negativo" | "advertencia";
}) {
  const color =
    tono === "negativo"
      ? "text-rose-600 dark:text-rose-400"
      : tono === "advertencia"
        ? "text-amber-700 dark:text-amber-300"
        : tono === "positivo"
          ? "text-emerald-700 dark:text-[#4ee6b0]"
          : "text-slate-950 dark:text-[#f2f7f4]";
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 last:pr-0 md:px-5">
      <p className="text-xs font-medium text-slate-500 dark:text-[#94a19c]">{label}</p>
      <p
        title={valorCompleto ?? valor}
        className={`mt-1 whitespace-nowrap text-xl font-bold tabular-nums md:text-2xl ${color}`}
      >
        {valor}
      </p>
      <div className="mt-1 min-h-5 text-xs text-slate-400 dark:text-[#74817b]">
        {delta !== undefined ? <Delta valor={delta} texto={textoDelta} /> : nota}
      </div>
    </div>
  );
}
