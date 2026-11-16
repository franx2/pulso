-- AlterTable
ALTER TABLE "ItemVenta" ADD COLUMN     "descuentoMonto" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "descuentoNombre" TEXT,
ADD COLUMN     "descuentoPct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "DescuentoPlantilla" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION,
    "monto" DOUBLE PRECISION,
    "tope" DOUBLE PRECISION,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DescuentoPlantilla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DescuentoPlantilla_localId_nombre_key" ON "DescuentoPlantilla"("localId", "nombre");

-- AddForeignKey
ALTER TABLE "DescuentoPlantilla" ADD CONSTRAINT "DescuentoPlantilla_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

