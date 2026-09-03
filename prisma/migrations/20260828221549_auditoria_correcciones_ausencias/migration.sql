-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "TipoCorreccion" AS ENUM ('AGREGAR', 'MODIFICAR', 'ELIMINAR');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('VACACIONES', 'ENFERMEDAD', 'FRANCO', 'LICENCIA', 'FALTA', 'OTRO');

-- AlterTable
ALTER TABLE "Fichaje" ADD COLUMN     "corregido" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudCorreccion" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fichajeId" TEXT,
    "tipo" "TipoCorreccion" NOT NULL,
    "tipoFichaje" "TipoFichaje",
    "fechaHora" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "resueltaPorId" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudCorreccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ausencia" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoAusencia" NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "motivo" TEXT,
    "certificado" BYTEA,
    "certificadoTipo" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "resueltaPorId" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Auditoria_createdAt_idx" ON "Auditoria"("createdAt");

-- CreateIndex
CREATE INDEX "SolicitudCorreccion_estado_createdAt_idx" ON "SolicitudCorreccion"("estado", "createdAt");

-- CreateIndex
CREATE INDEX "Ausencia_empleadoId_desde_hasta_idx" ON "Ausencia"("empleadoId", "desde", "hasta");

-- CreateIndex
CREATE INDEX "Ausencia_estado_idx" ON "Ausencia"("estado");

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCorreccion" ADD CONSTRAINT "SolicitudCorreccion_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCorreccion" ADD CONSTRAINT "SolicitudCorreccion_fichajeId_fkey" FOREIGN KEY ("fichajeId") REFERENCES "Fichaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudCorreccion" ADD CONSTRAINT "SolicitudCorreccion_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_resueltaPorId_fkey" FOREIGN KEY ("resueltaPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
