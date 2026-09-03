import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const INVITACION_DIAS = 7;

async function main() {
  let local = await db.local.findFirst();
  if (!local) {
    local = await db.local.create({ data: { nombre: "Mi restaurante" } });
    console.log(`Local creado: ${local.nombre}`);
  }

  let admin = await db.empleado.findUnique({ where: { usuario: "admin" } });
  if (!admin) {
    admin = await db.empleado.create({
      data: { usuario: "admin", nombre: "Administrador", rol: "ADMIN", localId: local.id },
    });
    console.log("Empleado admin creado (usuario: admin)");
  }

  const yaRegistrado = await db.credential.findFirst({ where: { empleadoId: admin.id } });
  if (yaRegistrado) {
    console.log("El admin ya registró su passkey, no hace falta un nuevo link.");
    return;
  }

  const invitacion = await db.registroInvitacion.create({
    data: {
      empleadoId: admin.id,
      token: randomUUID(),
      expiraEn: new Date(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000),
    },
  });

  const origin = process.env.ORIGIN ?? "http://localhost:3000";
  console.log("\nAbrí este link en tu celular para registrar el passkey del admin:");
  console.log(`${origin}/registro/${invitacion.token}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
