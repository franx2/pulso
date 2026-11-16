"use client";

import {
  useEffect,
  useId,
  useRef,
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
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary:
      "bg-slate-950 text-[#FDFDFC] hover:bg-slate-800",
    ghost: "bg-[#FDFDFC] text-slate-800 border border-slate-300 hover:border-slate-400 hover:bg-slate-50",
    danger:
      "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-700 focus:ring-2 focus:ring-arena-200 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-700 focus:ring-2 focus:ring-arena-200 ${className}`}
      {...props}
    />
  );
}

export function Checkbox({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 shrink-0 cursor-pointer accent-slate-950 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-700 focus:ring-2 focus:ring-arena-200 ${className}`}
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
      className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Etiqueta de un campo.
 *
 * Había 65 `<Label>` en 14 pantallas y ninguna estaba asociada a su campo: un
 * lector de pantalla anunciaba "cuadro de texto" sin nombre, y tocar la
 * etiqueta en el celular no llevaba el foco al campo. Cambiar los 65 usos uno
 * por uno era propenso a errores, así que la convención del proyecto —la
 * etiqueta va inmediatamente antes de su campo, solo o dentro de un
 * contenedor— se resuelve acá, en un único lugar.
 *
 * Un `htmlFor` explícito siempre gana. Una etiqueta que no antecede a ningún
 * campo (un rótulo de grupo) queda como está.
 */
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const etiqueta = useRef<HTMLLabelElement>(null);
  const idAutomatico = useId();

  useEffect(() => {
    const nodo = etiqueta.current;
    if (!nodo || htmlFor) return;
    const siguiente = nodo.nextElementSibling;
    if (!siguiente) return;
    const selector = "input:not([type=hidden]), select, textarea";
    const control = siguiente.matches(selector) ? siguiente : siguiente.querySelector(selector);
    if (!control) return;
    if (!control.id) control.id = idAutomatico;
    nodo.htmlFor = control.id;
  });

  return (
    <label ref={etiqueta} htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-600">
      {children}
    </label>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950" />
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
    <div className="sticky top-0 z-10 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-papel/95 px-4 py-3.5 backdrop-blur-sm supports-backdrop-blur:bg-papel/85 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      <div className="min-w-0">
        <h1 className="titulo-marca flex items-center gap-2 text-xl font-bold md:text-2xl">
          {children}
        </h1>
        {subtitle && <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  if (!action) {
    return <p className="titulo-marca mb-3 text-xs font-semibold text-slate-600">{children}</p>;
  }
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="titulo-marca text-xs font-semibold text-slate-600">{children}</p>
      {action}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  // role="alert": un error que aparece debajo de un formulario no se anuncia
  // solo; sin esto quien usa lector de pantalla no se entera de que falló.
  return (
    <p role="alert" className="text-sm font-medium text-red-600">
      {children}
    </p>
  );
}

export function EmptyState({ children, inCard = true }: { children: ReactNode; inCard?: boolean }) {
  const text = <p className="text-center text-sm text-slate-500">{children}</p>;
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
    danger: "text-slate-300 hover:text-red-500",
    default: "text-slate-300 hover:text-emerald-600",
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 ${tones[tone]} ${className}`}
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
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Pila de diálogos abiertos: sólo el de arriba responde a Escape y a Tab. */
const dialogosAbiertos: symbol[] = [];

/**
 * Diálogo modal.
 *
 * Es un diálogo de verdad para el teclado y los lectores de pantalla: declara
 * su rol y su título, se cierra con Escape, lleva el foco adentro al abrir, lo
 * mantiene adentro con Tab, lo devuelve a lo que lo abrió y no deja scrollear
 * el fondo. Antes era un div con fondo oscuro: con teclado se podía tabular
 * hasta los controles de atrás sin darse cuenta.
 *
 * El foco inicial va al primer control del contenido (el primer campo de un
 * formulario; "Cancelar" en una confirmación, que es la opción segura), no a
 * la X de cerrar.
 */
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
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);
  const contenido = useRef<HTMLDivElement>(null);
  const alCerrar = useRef(onClose);

  useEffect(() => {
    alCerrar.current = onClose;
  });

  useEffect(() => {
    const clave = Symbol("modal");
    dialogosAbiertos.push(clave);
    const quienLoAbrio = document.activeElement as HTMLElement | null;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const enfocables = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [])].filter(
        (el) => el.getClientRects().length > 0
      );

    const inicial = contenido.current?.querySelector<HTMLElement>(ENFOCABLES) ?? enfocables()[0] ?? panel.current;
    inicial?.focus();

    function alTeclear(e: KeyboardEvent) {
      if (dialogosAbiertos[dialogosAbiertos.length - 1] !== clave) return;
      if (e.key === "Escape") {
        e.preventDefault();
        alCerrar.current();
        return;
      }
      if (e.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || !panel.current?.contains(activo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !panel.current?.contains(activo))) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      const posicion = dialogosAbiertos.indexOf(clave);
      if (posicion >= 0) dialogosAbiertos.splice(posicion, 1);
      document.body.style.overflow = overflowPrevio;
      quienLoAbrio?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 px-0 sm:items-center sm:px-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={`max-h-[85vh] w-full ${maxWidth} overflow-y-auto rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl`}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <h3 id={idTitulo} className="titulo-marca text-lg font-bold">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.3} />
          </button>
        </div>
        <div ref={contenido} className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4">
          {children}
        </div>
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
      {request.message && <div className="text-sm text-slate-600">{request.message}</div>}
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
      className={`rounded-lg border border-slate-200 bg-white ${className}`}
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <h2 className="titulo-marca text-sm font-bold text-slate-950">{titulo}</h2>
        {descripcion && (
          <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500">{descripcion}</p>
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
      className="scrollbar-hidden inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-[#FDFDFC] p-0.5"
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
          className={`min-h-8 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${
            valor === opcion.clave
              ? "bg-slate-950 text-[#FDFDFC]"
              : "text-slate-500 hover:text-slate-900"
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
    return <span className="text-xs text-slate-500">sin base comparable</span>;
  }
  const sube = valor >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        sube ? "text-emerald-700" : "text-rose-600"
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
      ? "text-rose-600"
      : tono === "advertencia"
        ? "text-amber-700"
        : tono === "positivo"
          ? "text-emerald-700"
          : "text-slate-950";
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 last:pr-0 md:px-5">
      <p className="titulo-marca text-[0.6875rem] font-semibold text-slate-500">{label}</p>
      <p
        title={valorCompleto ?? valor}
        className={`mt-1 whitespace-nowrap text-xl font-bold tabular-nums md:text-2xl ${color}`}
      >
        {valor}
      </p>
      <div className="mt-1 min-h-5 text-xs text-slate-500">
        {delta !== undefined ? <Delta valor={delta} texto={textoDelta} /> : nota}
      </div>
    </div>
  );
}
