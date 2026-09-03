/*
  Warnings:

  - Added the required column `finAt` to the `Turno` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inicioAt` to the `Turno` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Turno" ADD COLUMN     "finAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "inicioAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Turno_empleadoId_fecha_idx" ON "Turno"("empleadoId", "fecha");
