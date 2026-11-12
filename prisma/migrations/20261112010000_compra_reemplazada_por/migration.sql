-- Remito reemplazado por su factura: deja de sumar. Null en todo lo demás.
ALTER TABLE "Compra" ADD COLUMN "reemplazadaPorId" TEXT;
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_reemplazadaPorId_fkey"
  FOREIGN KEY ("reemplazadaPorId") REFERENCES "Compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
