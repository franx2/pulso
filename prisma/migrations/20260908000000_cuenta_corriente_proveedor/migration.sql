-- Cuenta corriente por local con la fábrica: saldo inicial + pagos a mano.
-- Los remitos ya existen (Compra); el saldo se calcula, nunca se guarda.

ALTER TABLE "Local" ADD COLUMN "saldoInicialProveedor" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Local" ADD COLUMN "saldoInicialProveedorFecha" DATE;

CREATE TABLE "PagoProveedor" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "medio" TEXT,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagoProveedor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PagoProveedor_localId_fecha_idx" ON "PagoProveedor"("localId", "fecha");

ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
