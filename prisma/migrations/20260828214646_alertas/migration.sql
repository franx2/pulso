-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('NO_FICHO', 'LLEGADA_TARDE', 'SALIDA_OLVIDADA', 'EXCESO_HORARIO');

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "Alerta" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "fecha" DATE NOT NULL,
    "detalle" TEXT NOT NULL,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "resueltaPorId" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "notificadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alerta_resuelta_fecha_idx" ON "Alerta"("resuelta", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Alerta_empleadoId_fecha_tipo_key" ON "Alerta"("empleadoId", "fecha", "tipo");

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
