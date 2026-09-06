-- Comisiones por local y costos fijos mensuales cargados a mano.

ALTER TABLE "Local" ADD COLUMN "comisionCredito" DOUBLE PRECISION NOT NULL DEFAULT 0.04;
ALTER TABLE "Local" ADD COLUMN "comisionDebito" DOUBLE PRECISION NOT NULL DEFAULT 0.02;
ALTER TABLE "Local" ADD COLUMN "comisionBilletera" DOUBLE PRECISION NOT NULL DEFAULT 0.02;
ALTER TABLE "Local" ADD COLUMN "comisionDelivery" DOUBLE PRECISION NOT NULL DEFAULT 0.27;

CREATE TABLE "CostoFijo" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "nota" TEXT,
    CONSTRAINT "CostoFijo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostoFijo_localId_mes_concepto_key" ON "CostoFijo"("localId", "mes", "concepto");
CREATE INDEX "CostoFijo_localId_mes_idx" ON "CostoFijo"("localId", "mes");

ALTER TABLE "CostoFijo" ADD CONSTRAINT "CostoFijo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
