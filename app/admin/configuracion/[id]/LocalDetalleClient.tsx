"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Crosshair, Save } from "lucide-react";
import {
  Button,
  Card,
  Checkbox,
  ErrorText,
  Input,
  Label,
  PageTitle,
  SectionTitle,
} from "@/components/ui";
import HorarioSemanal from "./HorarioSemanal";
import CategoriasLocal from "./CategoriasLocal";

type Local = {
  nombre: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  descuentaDescanso: boolean;
  toleranciaMin: number;
  topeSemanalHoras: number;
  verificarRostro: boolean;
  rostroTolerancia: number;
};

export default function LocalDetalleClient({ localId }: { localId: string }) {
  const [local, setLocal] = useState<Local | null>(null);
  const [nombre, setNombre] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radioMetros, setRadioMetros] = useState("150");
  const [descuentaDescanso, setDescuentaDescanso] = useState(true);
  const [toleranciaMin, setToleranciaMin] = useState("10");
  const [topeSemanalHoras, setTopeSemanalHoras] = useState("48");
  const [verificarRostro, setVerificarRostro] = useState(false);
  const [rostroTolerancia, setRostroTolerancia] = useState("0.55");
  const [ubicando, setUbicando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch(`/api/locales/${localId}`)
      .then((r) => r.json())
      .then((d) => {
        const l: Local | null = d.local;
        setLocal(l);
        if (!l) return;
        setNombre(l.nombre);
        setLat(l.lat != null ? String(l.lat) : "");
        setLng(l.lng != null ? String(l.lng) : "");
        setRadioMetros(String(l.radioMetros));
        setDescuentaDescanso(l.descuentaDescanso);
        setToleranciaMin(String(l.toleranciaMin));
        setTopeSemanalHoras(String(l.topeSemanalHoras));
        setVerificarRostro(l.verificarRostro);
        setRostroTolerancia(String(l.rostroTolerancia));
      });
  }, [localId]);

  function usarUbicacionActual() {
    setError("");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setUbicando(false);
      },
      () => {
        setError("No se pudo obtener tu ubicación. Revisá los permisos del navegador.");
        setUbicando(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardado(false);
    setGuardando(true);
    const res = await fetch(`/api/locales/${localId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        lat: lat.trim() ? Number(lat) : null,
        lng: lng.trim() ? Number(lng) : null,
        radioMetros: Number(radioMetros),
        descuentaDescanso,
        toleranciaMin: Number(toleranciaMin),
        topeSemanalHoras: Number(topeSemanalHoras),
        verificarRostro,
        rostroTolerancia: Number(rostroTolerancia),
      }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) return setError(data.error ?? "No se pudo guardar");
    setGuardado(true);
  }

  if (!local) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/configuracion"
          className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-[#94a19c]"
        >
          <ArrowLeft size={14} />
          Todas las sucursales
        </Link>
        <PageTitle>{local.nombre}</PageTitle>
      </div>

      <form onSubmit={guardar} className="flex flex-col gap-6">
        <Card>
          <SectionTitle>General</SectionTitle>
          <Label>Nombre</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </Card>

        <Card>
          <SectionTitle>Ubicación</SectionTitle>
          <p className="mb-4 text-sm text-slate-500 dark:text-[#94a19c]">
            Con una ubicación cargada, el personal sólo puede fichar dentro del radio indicado.
            Dejá los campos vacíos para no exigir ubicación.
          </p>
          <div className="flex flex-col gap-3">
            <Button type="button" variant="ghost" onClick={usarUbicacionActual} disabled={ubicando}>
              <Crosshair size={16} />
              {ubicando ? "Ubicando…" : "Usar mi ubicación actual"}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Latitud</Label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-34.6037" inputMode="decimal" />
              </div>
              <div>
                <Label>Longitud</Label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-58.3816" inputMode="decimal" />
              </div>
            </div>
            <div>
              <Label>Radio permitido (metros)</Label>
              <Input type="number" min={10} value={radioMetros} onChange={(e) => setRadioMetros(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>Cálculo de horas</SectionTitle>
          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-3">
              <Checkbox
                className="mt-1"
                checked={descuentaDescanso}
                onChange={(e) => setDescuentaDescanso(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Descontar el descanso de las horas trabajadas</span>
                <span className="mt-0.5 block text-slate-500 dark:text-[#94a19c]">
                  Si está apagado, el descanso se registra para saber dónde está cada uno pero se
                  paga como tiempo trabajado.
                </span>
              </span>
            </label>

            <div>
              <Label>Tolerancia de tardanza (minutos)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={toleranciaMin}
                onChange={(e) => setToleranciaMin(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">
                Llegar dentro de estos minutos no cuenta como tardanza.
              </p>
            </div>

            <div>
              <Label>Tope semanal de horas</Label>
              <Input
                type="number"
                min={1}
                step="0.5"
                value={topeSemanalHoras}
                onChange={(e) => setTopeSemanalHoras(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">
                Lo que exceda este total en la semana cuenta como hora extra. Se liquida la mayor
                entre las extras diarias y este excedente, nunca las dos sumadas.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>Reconocimiento facial</SectionTitle>
          <div className="flex flex-col gap-4">
            <label className="flex items-start gap-3">
              <Checkbox
                className="mt-1"
                checked={verificarRostro}
                onChange={(e) => setVerificarRostro(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Verificar el rostro por cámara al fichar</span>
                <span className="mt-0.5 block text-slate-500 dark:text-[#94a19c]">
                  Cada empleado registra su cara una vez desde su celular. Al fichar, la cámara
                  confirma que es la misma persona. Nunca bloquea el fichaje: si no coincide, se
                  registra igual y te aparece en Presencia para revisar.
                </span>
              </span>
            </label>

            {verificarRostro && (
              <>
                <div>
                  <Label>Tolerancia del reconocimiento</Label>
                  <Input
                    type="number"
                    min={0.3}
                    max={0.8}
                    step="0.05"
                    value={rostroTolerancia}
                    onChange={(e) => setRostroTolerancia(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-[#94a19c]">
                    0.55 es un buen punto de partida. Más bajo es más estricto y rechaza más caras
                    legítimas; si en la cocina hay vapor, gorros o poca luz, subilo a 0.60.
                  </p>
                </div>

                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-[#5a4a2f] dark:bg-[#241f14] dark:text-amber-200">
                  El rostro es un dato biométrico sensible (Ley 25.326): cada empleado tiene que
                  dar su consentimiento explícito, que la app le pide y registra con fecha.
                  Consultá con tu contador o abogado antes de activarlo con el personal real.
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={guardando}>
            <Save size={16} />
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <ErrorText>{error}</ErrorText>
          {guardado && <p className="text-sm font-medium text-emerald-700 dark:text-[#4ee6b0]">Guardado.</p>}
        </div>
      </form>

      <HorarioSemanal localId={localId} />
      <CategoriasLocal localId={localId} />
    </div>
  );
}
