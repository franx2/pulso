"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { ArrowLeft, CheckCircle2, Fingerprint, KeyRound, UserPlus } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button, Card, ErrorText, Input, Label, Select } from "@/components/ui";

type Modo = "passkey" | "password" | "crear";

const TITULO: Record<Modo, string> = {
  passkey: "Ingresar",
  password: "Ingresar",
  crear: "Crear cuenta",
};

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [modo, setModo] = useState<Modo>("passkey");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  function irA(rol: string) {
    router.push(rol === "ADMIN" ? "/admin/empleados" : "/fichar");
  }

  function cambiarModo(m: Modo) {
    setModo(m);
    setError("");
    setAviso("");
    setPassword("");
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
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[#f6f8f5] px-6 py-10 dark:bg-[#0b1412]">
      <Brand centered />
      <Card className={`w-full ${modo === "crear" ? "max-w-sm" : "max-w-xs"}`}>
        <h1 className="mb-4 text-lg font-semibold">{TITULO[modo]}</h1>

        {modo === "crear" ? (
          <CrearCuenta
            onCreada={(u) => {
              setUsuario(u);
              cambiarModo("password");
              setAviso("Cuenta creada. Un administrador tiene que activarla; cuando lo haga, entrás con tu usuario y contraseña.");
            }}
            onVolver={() => cambiarModo("passkey")}
          />
        ) : (
          <form
            onSubmit={(e) => {
              if (modo === "password") return ingresarConPassword(e);
              e.preventDefault();
              ingresarConPasskey();
            }}
          >
            {aviso && (
              <p role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-[#122620] dark:text-[#9cefd0]">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                {aviso}
              </p>
            )}
            <Label>Usuario</Label>
            <Input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="tu.usuario"
              autoComplete="username"
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
                  autoComplete="current-password"
                />
              </div>
            )}

            {modo === "passkey" ? (
              <Button type="submit" disabled={cargando || !usuario.trim()} className="mt-4 w-full py-3">
                <Fingerprint size={18} />
                {cargando ? "Ingresando…" : "Ingresar con Face ID / huella"}
              </Button>
            ) : (
              <Button type="submit" disabled={cargando || !usuario.trim() || !password} className="mt-4 w-full py-3">
                <KeyRound size={18} />
                {cargando ? "Ingresando…" : "Ingresar con contraseña"}
              </Button>
            )}

            <button
              type="button"
              onClick={() => cambiarModo(modo === "passkey" ? "password" : "passkey")}
              className="mt-3 w-full rounded-lg py-2 text-center text-sm text-slate-500 underline dark:text-[#94a19c]"
            >
              {modo === "passkey" ? "Prefiero ingresar con contraseña" : "Prefiero usar Face ID / huella"}
            </button>

            <div className="mt-3">
              <ErrorText>{error}</ErrorText>
            </div>

            <div className="mt-3 border-t border-slate-100 pt-4 text-center text-sm dark:border-[#1c2521]">
              <span className="text-slate-500 dark:text-[#94a19c]">¿Es tu primera vez? </span>
              <button
                type="button"
                onClick={() => cambiarModo("crear")}
                className="font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-[#4ee6b0]"
              >
                Crear cuenta
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function CrearCuenta({ onCreada, onVolver }: { onCreada: (usuario: string) => void; onVolver: () => void }) {
  const [locales, setLocales] = useState<{ id: string; nombre: string }[]>([]);
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [localId, setLocalId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/crear-cuenta")
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []))
      .catch(() => {});
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("La contraseña tiene que tener al menos 8 caracteres.");
    if (password !== confirmar) return setError("Las contraseñas no coinciden.");
    if (!localId) return setError("Elegí la sucursal donde trabajás.");
    setCargando(true);
    const res = await fetch("/api/auth/crear-cuenta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, usuario, localId, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo crear la cuenta");
    onCreada(usuario.trim());
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <div>
        <Label>Nombre y apellido</Label>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus autoComplete="name" />
      </div>
      <div>
        <Label>Usuario</Label>
        <Input
          value={usuario}
          onChange={(e) => setUsuario(e.target.value.replace(/\s/g, ""))}
          required
          placeholder="nombre.apellido"
          autoComplete="username"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">Con esto vas a entrar. Sin espacios.</p>
      </div>
      <div>
        <Label>Sucursal donde trabajás</Label>
        <Select value={localId} onChange={(e) => setLocalId(e.target.value)} required>
          <option value="" disabled>
            Elegí una
          </option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Email (opcional)</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Contraseña</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        </div>
        <div>
          <Label>Repetila</Label>
          <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required autoComplete="new-password" />
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-[#94a19c]">
        Al menos 8 caracteres. Tu cuenta queda pendiente hasta que un administrador la active; después podés sumar
        Face ID o huella desde tu celular.
      </p>

      <ErrorText>{error}</ErrorText>

      <Button type="submit" disabled={cargando} className="w-full py-3">
        <UserPlus size={18} aria-hidden />
        {cargando ? "Creando…" : "Crear cuenta"}
      </Button>
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm text-slate-500 hover:text-slate-900 dark:text-[#94a19c] dark:hover:text-[#f2f7f4]"
      >
        <ArrowLeft size={15} aria-hidden />
        Volver a ingresar
      </button>
    </form>
  );
}
