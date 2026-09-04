-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "fudoApiKey" TEXT,
ADD COLUMN     "fudoApiSecret" TEXT,
ADD COLUMN     "demandaSincronizadaEn" TIMESTAMP(3);
