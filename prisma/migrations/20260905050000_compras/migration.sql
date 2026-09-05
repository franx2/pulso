-- Remitos de compra del proveedor, que llegan por mail y se leen solos.

CREATE TYPE "TipoCompra" AS ENUM ('MERCADERIA', 'SERVICIO');

-- Cómo figura cada local en los remitos. El CUIT es la clave estable.
ALTER TABLE "Local" ADD COLUMN "cuitCompras" TEXT;
ALTER TABLE "Local" ADD COLUMN "razonSocialCompras" TEXT;

CREATE TABLE "Compra" (
    "id" TEXT NOT NULL,
    "localId" TEXT,
    "numero" TEXT NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "proveedor" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "cuit" TEXT,
    "observaciones" TEXT,
    "sumaLineas" DOUBLE PRECISION NOT NULL,
    "ajustePct" DOUBLE PRECISION,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "tipo" "TipoCompra" NOT NULL DEFAULT 'MERCADERIA',
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "problemas" TEXT[],
    "origen" TEXT,
    "textoPlano" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompraItem" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "cantidadExacta" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioUnitario" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "totalConAjuste" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "CompraItem_pkey" PRIMARY KEY ("id")
);

-- El mismo remito no puede entrar dos veces aunque el mail se reenvíe.
CREATE UNIQUE INDEX "Compra_puntoVenta_numero_cuit_key" ON "Compra"("puntoVenta", "numero", "cuit");
CREATE INDEX "Compra_localId_fecha_idx" ON "Compra"("localId", "fecha");
CREATE INDEX "CompraItem_compraId_idx" ON "CompraItem"("compraId");
CREATE INDEX "CompraItem_codigo_idx" ON "CompraItem"("codigo");

ALTER TABLE "Compra" ADD CONSTRAINT "Compra_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompraItem" ADD CONSTRAINT "CompraItem_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
