import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { redirect } from "next/navigation";

export type Rol = "ADMIN" | "ENCARGADO" | "EMPLEADO";

export type SessionData = {
  empleadoId?: string;
  usuario?: string;
  nombre?: string;
  rol?: Rol;
  localId?: string;
};

const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "cp_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

/** Un encargado puede todo lo de un empleado, y un admin todo lo de un encargado. */
export function alMenos(rol: Rol | undefined, minimo: Rol): boolean {
  const rango: Record<Rol, number> = { EMPLEADO: 0, ENCARGADO: 1, ADMIN: 2 };
  return rol !== undefined && rango[rol] >= rango[minimo];
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** Completa el login: arma la cookie de sesión a partir del empleado ya validado. */
export async function iniciarSesion(empleado: {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  localId: string;
}) {
  const session = await getSession();
  session.empleadoId = empleado.id;
  session.usuario = empleado.usuario;
  session.nombre = empleado.nombre;
  session.rol = empleado.rol;
  session.localId = empleado.localId;
  await session.save();
}

export async function requireEmpleado(): Promise<SessionData> {
  const session = await getSession();
  if (!session.empleadoId) redirect("/login");
  return session;
}

/** Turnos, presencia, correcciones y ausencias: encargado o admin. */
export async function requireEncargado(): Promise<SessionData> {
  const session = await requireEmpleado();
  if (!alMenos(session.rol, "ENCARGADO")) redirect("/fichar");
  return session;
}

/** Alta de personal y configuración del local: sólo admin. */
export async function requireAdmin(): Promise<SessionData> {
  const session = await requireEmpleado();
  if (!alMenos(session.rol, "ADMIN")) redirect("/fichar");
  return session;
}

// Para API routes: sin redirect, el cliente hace fetch() y necesita JSON.
export async function requireEmpleadoApi(): Promise<SessionData | null> {
  const session = await getSession();
  return session.empleadoId ? session : null;
}

export async function requireEncargadoApi(): Promise<SessionData | null> {
  const session = await requireEmpleadoApi();
  return session && alMenos(session.rol, "ENCARGADO") ? session : null;
}

export async function requireAdminApi(): Promise<SessionData | null> {
  const session = await requireEmpleadoApi();
  return session && alMenos(session.rol, "ADMIN") ? session : null;
}
