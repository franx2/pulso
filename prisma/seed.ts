import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const INVITACION_DIAS = 7;

/**
 * Feriados nacionales de fecha fija (no dependen de decreto ni del calendario
 * lunar). Los trasladables — Carnaval, Semana Santa, y los que el gobierno
 * mueve al lunes más cercano (Güemes, San Martín, Diversidad Cultural,
 * Soberanía) o decreta como "puente turístico" — cambian año a año y no se
 * pueden asumir: se cargan a mano desde Ajustes cuando se confirme la fecha.
 */
const FERIADOS_FIJOS = [
  { mes: 1, dia: 1, nombre: "Año Nuevo" },
  { mes: 3, dia: 24, nombre: "Día Nacional de la Memoria por la Verdad y la Justicia" },
  { mes: 4, dia: 2, nombre: "Día del Veterano y de los Caídos en la Guerra de Malvinas" },
  { mes: 5, dia: 1, nombre: "Día del Trabajador" },
  { mes: 5, dia: 25, nombre: "Día de la Revolución de Mayo" },
  { mes: 6, dia: 20, nombre: "Paso a la Inmortalidad del General Belgrano (Día de la Bandera)" },
  { mes: 7, dia: 9, nombre: "Día de la Independencia" },
  { mes: 12, dia: 8, nombre: "Inmaculada Concepción de María" },
  { mes: 12, dia: 25, nombre: "Navidad" },
];

async function sembrarFeriados(anio: number) {
  for (const f of FERIADOS_FIJOS) {
    const fecha = new Date(Date.UTC(anio, f.mes - 1, f.dia));
    await db.feriado.upsert({
      where: { fecha },
      create: { fecha, nombre: f.nombre },
      update: { nombre: f.nombre },
    });
  }
  console.log(`Feriados fijos de ${anio} cargados (${FERIADOS_FIJOS.length}).`);
}

async function main() {
  await sembrarFeriados(new Date().getFullYear());

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
