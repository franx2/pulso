-- CreateEnum
CREATE TYPE "VerificacionRostro" AS ENUM ('OK', 'NO_COINCIDE', 'SIN_ROSTRO', 'NO_REGISTRADO', 'OMITIDA');

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "consentimientoBiometrico" TIMESTAMP(3),
ADD COLUMN     "rostroDescriptor" BYTEA,
ADD COLUMN     "rostroFoto" BYTEA,
ADD COLUMN     "rostroFotoTipo" TEXT,
ADD COLUMN     "rostroRegistradoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Fichaje" ADD COLUMN     "rostro" "VerificacionRostro" NOT NULL DEFAULT 'OMITIDA',
ADD COLUMN     "rostroDistancia" DOUBLE PRECISION,
ADD COLUMN     "rostroFoto" BYTEA,
ADD COLUMN     "rostroFotoTipo" TEXT;

-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "rostroTolerancia" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
ADD COLUMN     "verificarRostro" BOOLEAN NOT NULL DEFAULT false;
