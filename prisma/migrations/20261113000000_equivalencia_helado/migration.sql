-- Gramos por formato de helado editables desde Compras → Helado.
CREATE TABLE "EquivalenciaHelado" (
    "formato" TEXT NOT NULL,
    "gramos" DOUBLE PRECISION NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquivalenciaHelado_pkey" PRIMARY KEY ("formato")
);
