import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (!session.empleadoId) redirect("/login");
  // El logo lleva acá: al admin, al Dashboard; al resto, a fichar.
  redirect(session.rol === "ADMIN" ? "/admin/dashboard" : "/fichar");
}
