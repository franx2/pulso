-- CreateTable
CREATE TABLE "StockDiario" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "fudoProductoId" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL,
    "stockPrevio" DOUBLE PRECISION,
    "vendido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "movimientoNoExplicado" DOUBLE PRECISION,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockDiario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockDiario_localId_fecha_idx" ON "StockDiario"("localId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "StockDiario_localId_fecha_fudoProductoId_key" ON "StockDiario"("localId", "fecha", "fudoProductoId");

-- AddForeignKey
ALTER TABLE "StockDiario" ADD CONSTRAINT "StockDiario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
