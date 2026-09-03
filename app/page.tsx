import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (!session.empleadoId) redirect("/login");
  redirect(session.rol === "ADMIN" ? "/admin/empleados" : "/fichar");
}
