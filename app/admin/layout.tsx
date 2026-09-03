import { requireEncargado } from "@/lib/session";

/**
 * Piso de acceso para todo /admin. Cada página endurece lo suyo: turnos y
 * presencia los ve el encargado, empleados y configuración sólo el admin.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireEncargado();
  return children;
}
