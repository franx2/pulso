"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button, ErrorText, Input, Label, Modal } from "@/components/ui";

/** Al cerrar un turno en un local con Fudo, el empleado cuenta el efectivo
 * de la caja y lo carga acá: es el arqueo (esperado según Fudo vs. contado). */
export default function ArqueoModal({
  fichajeId,
  efectivoEsperado,
  fondoInicial,
  efectivoVendido,
  gastosEfectivo,
  onListo,
}: {
  fichajeId: string;
  efectivoEsperado: number;
  /** Con caja vinculada, el desglose (fondo + vendido − gastos) del total. */
  fondoInicial?: number | null;
  efectivoVendido?: number | null;
  gastosEfectivo?: number | null;
  onListo: () => void;
}) {
  const [contado, setContado] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    const monto = Number(contado);
    if (contado.trim() === "" || Number.isNaN(monto) || monto < 0) {
      setError("Ingresá un monto válido");
      return;
    }
    setGuardando(true);
    setError("");
    const res = await fetch(`/api/fichajes/${fichajeId}/efectivo`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ efectivoContado: monto }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar");
      setGuardando(false);
      return;
    }
    onListo();
  }

  return (
    <Modal title="Arqueo de caja" onClose={onListo}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 text-sm text-slate-600 dark:text-[#c1cbc6]">
          <div className="flex items-center gap-2">
            <Wallet size={16} />
            Debería haber ${efectivoEsperado.toFixed(2)} en la caja.
          </div>
          {fondoInicial != null && efectivoVendido != null && (
            <p className="pl-6 text-xs text-slate-400 dark:text-[#74817b]">
              Fondo inicial ${fondoInicial.toFixed(2)} + vendido en efectivo $
              {efectivoVendido.toFixed(2)}
              {gastosEfectivo != null && gastosEfectivo > 0 && (
                <> − gastos pagados de la caja ${gastosEfectivo.toFixed(2)}</>
              )}
            </p>
          )}
        </div>

        <div>
          <Label>¿Cuánto contaste en la caja?</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={contado}
            onChange={(e) => setContado(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </div>

        <ErrorText>{error}</ErrorText>

        <Button type="button" className="w-full" onClick={confirmar} disabled={guardando}>
          {guardando ? "Guardando…" : "Confirmar"}
        </Button>
      </div>
    </Modal>
  );
}
