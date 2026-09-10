-- Movimientos del extracto bancario, importados desde CSV, para conciliar
-- contra lo que Fudo dice que se cobró por tarjeta y transferencia.

CREATE TYPE "CategoriaBancaria" AS ENUM ('TARJETA', 'TRANSFERENCIA', 'IMPUESTO_COMISION', 'OTRO');

CREATE TABLE "MovimientoBancario" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "referencia" TEXT,
    "categoria" "CategoriaBancaria" NOT NULL,
    "credito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldo" DOUBLE PRECISION,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoBancario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MovimientoBancario_localId_fecha_saldo_key" ON "MovimientoBancario"("localId", "fecha", "saldo");
CREATE INDEX "MovimientoBancario_localId_fecha_idx" ON "MovimientoBancario"("localId", "fecha");

ALTER TABLE "MovimientoBancario" ADD CONSTRAINT "MovimientoBancario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
