-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "precioHora" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "multiplicadorFeriado" DOUBLE PRECISION NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "Feriado" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feriado_fecha_key" ON "Feriado"("fecha");

-- CreateIndex
CREATE INDEX "Feriado_fecha_idx" ON "Feriado"("fecha");
