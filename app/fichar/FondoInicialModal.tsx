"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button, ErrorText, Input, Label, Modal } from "@/components/ui";

/** Al abrir un turno de caja (Fudo vinculado), el empleado carga cuánto
 * había en la caja antes de vender nada — el arqueo de la salida lo suma
 * a lo vendido para saber cuánto debería haber al cerrar. */
export default function FondoInicialModal({
  fichajeId,
  onListo,
}: {
  fichajeId: string;
  onListo: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    const valor = Number(monto);
    if (monto.trim() === "" || Number.isNaN(valor) || valor < 0) {
      setError("Ingresá un monto válido");
      return;
    }
    setGuardando(true);
    setError("");
    const res = await fetch(`/api/fichajes/${fichajeId}/fondo-inicial`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fondoInicial: valor }),
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
    <Modal title="Fondo de caja" onClose={onListo}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-[#c1cbc6]">
          <Wallet size={16} />
          ¿Cuánto efectivo había en la caja antes de vender? Al cerrar, sumamos esto a lo vendido
          para saber cuánto debería haber.
        </div>

        <div>
          <Label>Fondo inicial</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
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
