-- CreateEnum
CREATE TYPE "EstadoCocina" AS ENUM ('PENDIENTE', 'PREPARANDO', 'LISTO', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'SENTADA', 'CANCELADA', 'NO_VINO');

-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "propinaSugeridaPct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "clienteId" TEXT;

-- AlterTable
ALTER TABLE "ItemVenta" ADD COLUMN     "estadoCocina" "EstadoCocina" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "listoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "documento" TEXT,
    "direccion" TEXT,
    "descuentoPct" DOUBLE PRECISION,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "personas" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "clienteId" TEXT,
    "mesaId" TEXT,
    "comentario" TEXT,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cliente_localId_nombre_idx" ON "Cliente"("localId", "nombre");

-- CreateIndex
CREATE INDEX "PagoCliente_clienteId_idx" ON "PagoCliente"("clienteId");

-- CreateIndex
CREATE INDEX "Reserva_localId_fecha_idx" ON "Reserva"("localId", "fecha");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoCliente" ADD CONSTRAINT "PagoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Lo que ya se envió antes del monitor de cocina se da por entregado: si no,
-- el monitor arrancaría con todo el historial como pendiente.
UPDATE "ItemVenta" SET "estadoCocina" = 'ENTREGADO' WHERE "enviadoEn" IS NOT NULL;
