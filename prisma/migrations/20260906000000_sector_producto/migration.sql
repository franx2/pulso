-- Clasificación de productos por sector del negocio.
-- Las reglas viven en código; acá van sólo las excepciones cargadas a mano.

CREATE TYPE "SectorNegocio" AS ENUM ('HELADOS', 'CAFETERIA', 'CHOCOLATERIA', 'PROMOCION');

CREATE TABLE "SectorProducto" (
    "id" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "sector" "SectorNegocio" NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SectorProducto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectorProducto_producto_key" ON "SectorProducto"("producto");
CREATE INDEX "SectorProducto_sector_idx" ON "SectorProducto"("sector");
