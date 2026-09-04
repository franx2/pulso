"use client";

import { useEffect, useState } from "react";
import { Badge, Card, SectionTitle, Spinner } from "@/components/ui";

type ProductoLocal = { local: string; cantidad: number; facturacion: number; precioPromedio: number };
type Producto = {
  nombre: string;
  categoria: string | null;
  cantidad: number;
  facturacion: number;
  precioPromedio: number;
  margen: number | null;
  locales: ProductoLocal[];
};
type Analisis = {
  totalProductos: number;
  masVendidos: Producto[];
  masFacturan: Producto[];
  menosVendidos: Producto[];
  preciosDispares: (Producto & { min: number; max: number; difPct: number })[];
  desparejos: { nombre: string; local: string; facturacion: number }[];
};

const plata = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const unidades = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

const VISTAS = [
  { clave: "facturan", label: "Los que más facturan" },
  { clave: "vendidos", label: "Los que más salen" },
  { clave: "menos", label: "Los que menos salen" },
  { clave: "precios", label: "Precio distinto entre locales" },
] as const;
type Vista = (typeof VISTAS)[number]["clave"];

export default function ProductosPanel({
  desde,
  hasta,
  localId,
}: {
  desde: string;
  hasta: string;
  localId: string;
}) {
  const [datos, setDatos] = useState<Analisis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>("facturan");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, no data lib
    setCargando(true);
    const params = new URLSearchParams({ desde, hasta, ...(localId ? { localId } : {}) });
    fetch(`/api/productos?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setDatos(d);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [desde, hasta, localId]);

  if (cargando) {
    return (
      <Card>
        <SectionTitle>Productos</SectionTitle>
        <Spinner />
      </Card>
    );
  }
  if (!datos || datos.totalProductos === 0) return null;

  const lista =
    vista === "facturan" ? datos.masFacturan : vista === "vendidos" ? datos.masVendidos : datos.menosVendidos;

  return (
    <Card className="flex flex-col gap-4">
      <SectionTitle
        action={
          <span className="text-xs text-slate-400 dark:text-[#74817b]">
            {datos.totalProductos} productos con venta
          </span>
        }
      >
        Productos
      </SectionTitle>

      <div className="flex flex-wrap gap-1">
        {VISTAS.map((v) => (
          <button
            key={v.clave}
            type="button"
            onClick={() => setVista(v.clave)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-[#37e6b0] ${
              vista === v.clave
                ? "bg-emerald-700 text-white dark:bg-[#1d4e48] dark:text-[#37e6b0]"
                : "text-slate-500 hover:bg-slate-100 dark:text-[#94a19c] dark:hover:bg-[#172724]"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vista === "precios" ? (
        datos.preciosDispares.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-[#94a19c]">
            Ningún producto que se venda en más de una sucursal tiene una diferencia de precio
            mayor al 10%.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500 dark:text-[#94a19c]">
              Mismo producto, precio promedio distinto según la sucursal. O la lista de precios
              quedó desactualizada en algún local, o se está cobrando distinto.
            </p>
            {datos.preciosDispares.map((p) => (
              <div key={p.nombre} className="rounded-xl border border-slate-100 p-3 dark:border-[#1c2521]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.nombre}</span>
                  <Badge tone={p.difPct >= 30 ? "rose" : "amber"}>
                    {p.difPct.toFixed(0)}% de diferencia
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-[#94a19c]">
                  {p.locales
                    .slice()
                    .sort((a, b) => b.precioPromedio - a.precioPromedio)
                    .map((l) => (
                      <span key={l.local} className="tabular-nums">
                        {l.local}: <strong className="font-semibold">{plata(l.precioPromedio)}</strong>
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-[#26312d] dark:text-[#5d6d67]">
                <th className="py-2 pr-3 font-semibold">Producto</th>
                <th className="py-2 pr-3 text-right font-semibold">Unidades</th>
                <th className="py-2 pr-3 text-right font-semibold">Facturación</th>
                <th className="py-2 pr-3 text-right font-semibold">Precio prom.</th>
                <th className="py-2 text-right font-semibold">Locales</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.nombre} className="border-b border-slate-100 last:border-0 dark:border-[#1c2521]">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{p.nombre}</span>
                    {p.categoria && (
                      <span className="ml-1.5 text-xs text-slate-400 dark:text-[#74817b]">{p.categoria}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{unidades(p.cantidad)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{plata(p.facturacion)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{plata(p.precioPromedio)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500 dark:text-[#94a19c]">
                    {p.locales.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {vista === "menos" && (
            <p className="mt-2 text-xs text-slate-400 dark:text-[#74817b]">
              Son los que menos salieron entre los que se vendieron al menos una vez. Un producto
              con cero ventas no aparece: Fudo no reporta lo que nunca se vendió.
            </p>
          )}
        </div>
      )}

      {vista !== "precios" && datos.desparejos.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3 dark:border-[#1c2521]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-[#5d6d67]">
            Se venden en un solo local
          </p>
          <p className="text-xs text-slate-400 dark:text-[#74817b]">
            Puede ser carta distinta a propósito, o un producto que en las otras sucursales no se
            está ofreciendo.
          </p>
          {datos.desparejos.slice(0, 6).map((d) => (
            <div key={`${d.nombre}-${d.local}`} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-slate-600 dark:text-[#c1cbc6]">
                {d.nombre}
                <span className="ml-1.5 text-xs text-slate-400 dark:text-[#74817b]">sólo {d.local}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-[#94a19c]">
                {plata(d.facturacion)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
