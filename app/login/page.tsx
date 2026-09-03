"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [modo, setModo] = useState<"passkey" | "password">("passkey");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  function irA(rol: string) {
    router.push(rol === "ADMIN" ? "/admin/empleados" : "/fichar");
  }

  async function ingresarConPasskey() {
    if (!usuario.trim()) return;
    setCargando(true);
    setError("");
    try {
      const resOptions = await fetch("/api/auth/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario }),
      });
      const options = await resOptions.json();
      if (!resOptions.ok) throw new Error(options.error ?? "Error al iniciar sesión");

      const response = await startAuthentication({ optionsJSON: options });

      const resVerify = await fetch("/api/auth/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, response }),
      });
      const data = await resVerify.json();
      if (!resVerify.ok) throw new Error(data.error ?? "No se pudo verificar el login");

      irA(data.rol);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error");
      setCargando(false);
    }
  }

  async function ingresarConPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !password) return;
    setCargando(true);
    setError("");
    const res = await fetch("/api/auth/login-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar sesión");
      setCargando(false);
      return;
    }
    irA(data.rol);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[#f6f8f5] px-6 dark:bg-[#0b1412]">
      <Brand centered />
      <Card className="w-full max-w-xs">
        <Label>Usuario</Label>
        <Input
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && modo === "passkey" && ingresarConPasskey()}
          placeholder="tu.usuario"
          autoFocus
        />

        {modo === "password" && (
          <div className="mt-3">
            <Label>Contraseña</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        )}

        {modo === "passkey" ? (
          <Button onClick={ingresarConPasskey} disabled={cargando || !usuario.trim()} className="mt-4 w-full py-3">
            <Fingerprint size={18} />
            {cargando ? "Ingresando…" : "Ingresar con Face ID / huella"}
          </Button>
        ) : (
          <Button
            onClick={ingresarConPassword}
            disabled={cargando || !usuario.trim() || !password}
            className="mt-4 w-full py-3"
          >
            <KeyRound size={18} />
            {cargando ? "Ingresando…" : "Ingresar con contraseña"}
          </Button>
        )}

        <button
          type="button"
          onClick={() => {
            setModo(modo === "passkey" ? "password" : "passkey");
            setError("");
          }}
          className="mt-3 w-full rounded-lg py-3 text-center text-sm text-slate-500 underline dark:text-[#94a19c]"
        >
          {modo === "passkey" ? "Prefiero ingresar con contraseña" : "Prefiero usar Face ID / huella"}
        </button>

        <div className="mt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>
    </div>
  );
}
