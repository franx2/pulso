"use client";

import { useEffect, useState } from "react";
import PeriodoSelector, { usePeriodo } from "@/components/PeriodoSelector";
import { BarraContexto, SelectorLocal } from "@/components/BarraContexto";
import { PageTitle } from "@/components/ui";
import { fechaLarga } from "@/lib/formato";
import { rangoDias } from "@/lib/periodo";
import BancoPanel from "./BancoPanel";

/**
 * Banco: el extracto de cada sucursal, lo que hay que mirar de él y la
 * conciliación contra Fudo. Antes era una pestaña escondida dentro de
 * Resultado; los movimientos raros merecen su propio lugar en el menú.
 *
 * Cada sucursal tiene su propia cuenta, así que acá no hay "Cadena".
 */
export default function BancoClient() {
  const { valor, setValor, params: periodo, hoy } = usePeriodo();
  const { desde, hasta } = rangoDias(periodo, hoy);
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [localId, setLocalId] = useState("");

  useEffect(() => {
    fetch("/api/locales")
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <PageTitle subtitle="Extracto, movimientos para revisar y conciliación con Fudo">Banco</PageTitle>

      <BarraContexto
        campos={[
          {
            etiqueta: "Cuenta de",
            contenido: locales.length > 0 && (
              <SelectorLocal locales={locales} valor={localId} onChange={setLocalId} todos={null} />
            ),
          },
        ]}
        derecha={{ etiqueta: "Período", contenido: <PeriodoSelector valor={valor} onChange={setValor} hoy={hoy} /> }}
        pie={{
          alcance: locales.find((l) => l.id === localId)?.nombre ?? "Elegí una sucursal",
          detalle: `${fechaLarga(desde)} a ${fechaLarga(hasta)}`,
        }}
      />

      <BancoPanel
        localId={localId}
        periodo={periodo}
        onLocalSugerido={setLocalId}
        onPeriodoDetectado={(mes) => setValor({ ...valor, periodo: "mes-calendario", mes })}
      />
    </div>
  );
}
