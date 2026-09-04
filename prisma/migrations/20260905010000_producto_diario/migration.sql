-- CreateTable
CREATE TABLE "ProductoDiario" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "fudoProductoId" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "categoria" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "facturacion" DOUBLE PRECISION NOT NULL,
    "costo" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductoDiario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductoDiario_localId_fecha_idx" ON "ProductoDiario"("localId", "fecha");

-- CreateIndex
CREATE INDEX "ProductoDiario_producto_idx" ON "ProductoDiario"("producto");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoDiario_localId_fecha_fudoProductoId_key" ON "ProductoDiario"("localId", "fecha", "fudoProductoId");

-- AddForeignKey
ALTER TABLE "ProductoDiario" ADD CONSTRAINT "ProductoDiario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
