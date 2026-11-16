import { PrismaClient } from "@prisma/client";

// El certificado y la clave de ARCA nunca salen en una respuesta: quedan
// fuera de toda consulta salvo que se pidan explícitamente con `select`.
const crear = () => new PrismaClient({ omit: { local: { arcaCertificado: true, arcaClave: true, arcaToken: true, arcaSign: true } } });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof crear> };

export const db = globalForPrisma.prisma ?? crear();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
