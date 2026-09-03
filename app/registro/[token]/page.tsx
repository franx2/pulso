"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";

export default function RegistroPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [modo, setModo] = useState<"passkey" | "password">("passkey");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function registrarPasskey() {
    setCargando(true);
    setError("");
    try {
      const resOptions = await fetch("/api/auth/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const options = await resOptions.json();
      if (!resOptions.ok) throw new Error(options.error ?? "Error al iniciar el registro");

      const response = await startRegistration({ optionsJSON: options });

      const resVerify = await fetch("/api/auth/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, response }),
      });
      const data = await resVerify.json();
      if (!resVerify.ok) throw new Error(data.error ?? "No se pudo verificar el registro");

      router.push("/fichar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error");
      setCargando(false);
    }
  }

  async function registrarPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres");
    if (password !== confirmar) return setError("Las contraseñas no coinciden");

    setCargando(true);
    const res = await fetch("/api/auth/registro-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear la contraseña");
      setCargando(false);
      return;
    }
    router.push("/fichar");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-slate-50 px-6 text-center dark:bg-[#0b0e0d]">
      <Brand centered />
      <Card className="w-full max-w-sm">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-[#173e32] dark:text-[#4ee6b0]">
          {modo === "passkey" ? <Fingerprint size={28} /> : <KeyRound size={28} />}
        </div>

        {modo === "passkey" ? (
          <>
            <h1 className="text-lg font-bold">Registrá este dispositivo</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#94a19c]">
              Vas a usar Face ID, huella o el bloqueo de tu celular para fichar. Tocá el botón y
              seguí las instrucciones del teléfono.
            </p>
            <Button onClick={registrarPasskey} disabled={cargando} className="mt-5 w-full py-3">
              {cargando ? "Registrando…" : "Registrar dispositivo"}
            </Button>
          </>
        ) : (
          <form onSubmit={registrarPassword} className="text-left">
            <h1 className="text-center text-lg font-bold">Creá tu contraseña</h1>
            <p className="mt-1 text-center text-sm text-slate-500 dark:text-[#94a19c]">
              Al menos 8 caracteres. Vas a usarla junto con tu usuario para fichar.
            </p>
            <div className="mt-4">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="mt-3">
              <Label>Repetila</Label>
              <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </div>
            <Button type="submit" disabled={cargando} className="mt-5 w-full py-3">
              {cargando ? "Guardando…" : "Crear contraseña"}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setModo(modo === "passkey" ? "password" : "passkey");
            setError("");
          }}
          className="mt-3 w-full text-center text-sm text-slate-500 underline dark:text-[#94a19c]"
        >
          {modo === "passkey" ? "Prefiero crear una contraseña" : "Prefiero usar Face ID / huella"}
        </button>

        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>
    </div>
  );
}
