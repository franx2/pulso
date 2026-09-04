-- AlterTable
ALTER TABLE "Local" ADD COLUMN "resumenSincronizadoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ResumenDiario" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "ventas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tickets" INTEGER NOT NULL DEFAULT 0,
    "personas" INTEGER NOT NULL DEFAULT 0,
    "descuentos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "anulaciones" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gastos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costoIncompleto" BOOLEAN NOT NULL DEFAULT false,
    "porMedioPago" JSONB,
    "porCanal" JSONB,
    "porCategoria" JSONB,
    "topProductos" JSONB,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumenDiario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResumenDiario_localId_fecha_idx" ON "ResumenDiario"("localId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ResumenDiario_localId_fecha_key" ON "ResumenDiario"("localId", "fecha");

-- AddForeignKey
ALTER TABLE "ResumenDiario" ADD CONSTRAINT "ResumenDiario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
