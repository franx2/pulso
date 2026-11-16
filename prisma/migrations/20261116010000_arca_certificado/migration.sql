-- Facturación electrónica con ARCA, por local.
ALTER TABLE "Local" ADD COLUMN "arcaCertificado" TEXT,
ADD COLUMN "arcaClave" TEXT,
ADD COLUMN "arcaPuntoVenta" INTEGER,
ADD COLUMN "arcaProduccion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "arcaToken" TEXT,
ADD COLUMN "arcaSign" TEXT,
ADD COLUMN "arcaTicketVence" TIMESTAMP(3);

ALTER TABLE "Local" ADD COLUMN "arcaDatosTicket" TEXT;

CREATE TABLE "ComprobanteFiscal" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "tipo" INTEGER NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "produccion" BOOLEAN NOT NULL,
    "docTipo" INTEGER NOT NULL,
    "docNro" TEXT NOT NULL,
    "condicionIvaReceptor" INTEGER NOT NULL,
    "neto" DOUBLE PRECISION NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "anulaId" TEXT,
    "numero" INTEGER,
    "cae" TEXT,
    "caeVence" DATE,
    "emitidoEn" TIMESTAMP(3),
    "error" TEXT,
    "intentandoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprobanteFiscal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ComprobanteFiscal_ventaId_idx" ON "ComprobanteFiscal"("ventaId");
CREATE INDEX "ComprobanteFiscal_cae_idx" ON "ComprobanteFiscal"("cae");

ALTER TABLE "ComprobanteFiscal" ADD CONSTRAINT "ComprobanteFiscal_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComprobanteFiscal" ADD CONSTRAINT "ComprobanteFiscal_anulaId_fkey" FOREIGN KEY ("anulaId") REFERENCES "ComprobanteFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
