-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'ENCARGADO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoFichaje" ADD VALUE 'DESCANSO_INICIO';
ALTER TYPE "TipoFichaje" ADD VALUE 'DESCANSO_FIN';

-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "descuentaDescanso" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "toleranciaMin" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "topeSemanalHoras" DOUBLE PRECISION NOT NULL DEFAULT 48;

-- CreateTable
CREATE TABLE "AsignacionLocal" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionLocal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionLocal_empleadoId_localId_key" ON "AsignacionLocal"("empleadoId", "localId");

-- AddForeignKey
ALTER TABLE "AsignacionLocal" ADD CONSTRAINT "AsignacionLocal_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionLocal" ADD CONSTRAINT "AsignacionLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
