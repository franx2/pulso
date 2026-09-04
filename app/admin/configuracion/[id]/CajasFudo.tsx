"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Card, ErrorText, Select, SectionTitle, Spinner } from "@/components/ui";

type Caja = { id: string; nombre: string; empleadoId: string | null };
type Empleado = { id: string; nombre: string };

async function ponerFudoCajaId(empleadoId: string, fudoCajaId: string | null) {
  await fetch(`/api/empleados/${empleadoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fudoCajaId }),
  });
}

/**
 * Vínculo caja de Fudo ↔ empleado: en esta cuenta cada "Caja" es una
 * persona, no un canal fijo (mesas/delivery). Es la fuente correcta del
 * efectivo esperado en el arqueo — vincular acá reemplaza, para ese
 * empleado, sumar todo el efectivo del local mientras estuvo fichado.
 */
export default function CajasFudo({ localId }: { localId: string }) {
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  const [empleadosLocal, setEmpleadosLocal] = useState<Empleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function cargar() {
    setCargando(true);
    setError("");
    const res = await fetch(`/api/locales/${localId}/fudo-cajas`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo consultar Fudo");
      setCajas(null);
    } else {
      setCajas(data.cajas ?? []);
      setEmpleadosLocal(data.empleadosLocal ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no data lib
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  async function vincular(caja: Caja, nuevoEmpleadoId: string) {
    if (nuevoEmpleadoId === (caja.empleadoId ?? "")) return;
    setVinculando(caja.id);
    // Un empleado sólo puede tener una caja vinculada a la vez.
    if (caja.empleadoId) await ponerFudoCajaId(caja.empleadoId, null);
    if (nuevoEmpleadoId) await ponerFudoCajaId(nuevoEmpleadoId, caja.id);
    await cargar();
    setVinculando(null);
  }

  return (
    <Card>
      <SectionTitle>Cajas de Fudo</SectionTitle>
      <p className="mb-4 text-sm text-slate-500 dark:text-[#94a19c]">
        En esta cuenta de Fudo cada caja es una persona, no un canal fijo. Vinculá acá qué
        empleado de Pulso es cada una: el arqueo de caja usa esto para calcular el efectivo
        esperado de esa persona, en vez de todo el efectivo del local durante su turno.
      </p>

      {cargando && <Spinner />}
      <ErrorText>{error}</ErrorText>

      {cajas && !cargando && (
        <ul className="flex flex-col gap-2">
          {cajas.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm dark:border-[#1c2521]"
            >
              <span className="flex items-center gap-2">
                <Wallet size={14} />
                {c.nombre}
              </span>
              <Select
                value={c.empleadoId ?? ""}
                onChange={(e) => vincular(c, e.target.value)}
                disabled={vinculando === c.id}
                className="w-auto! py-1 text-xs"
              >
                <option value="">Sin vincular</option>
                {empleadosLocal.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
