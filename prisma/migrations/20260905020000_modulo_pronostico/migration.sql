-- CreateEnum
CREATE TYPE "TipoLocal" AS ENUM ('INDOOR_MALL', 'OPEN_AIR');
CREATE TYPE "Sector" AS ENUM ('COCINA', 'SALON', 'CAJA', 'DESPACHO', 'ENCARGADO');
CREATE TYPE "OrigenParametro" AS ENUM ('DEFECTO', 'APRENDIDO', 'MANUAL');

-- AlterTable
ALTER TABLE "Local" ADD COLUMN "tipoLocal" "TipoLocal" NOT NULL DEFAULT 'OPEN_AIR';

-- CreateTable
CREATE TABLE "DemandaSlot" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "slot" INTEGER NOT NULL,
    "tickets" INTEGER NOT NULL DEFAULT 0,
    "unidades" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ventas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "personas" INTEGER NOT NULL DEFAULT 0,
    "porCanal" JSONB,
    "porCategoria" JSONB,
    CONSTRAINT "DemandaSlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DemandaSlot_localId_fecha_slot_key" ON "DemandaSlot"("localId", "fecha", "slot");
CREATE INDEX "DemandaSlot_localId_fecha_idx" ON "DemandaSlot"("localId", "fecha");
ALTER TABLE "DemandaSlot" ADD CONSTRAINT "DemandaSlot_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoeficienteSector" (
    "id" TEXT NOT NULL,
    "localId" TEXT,
    "categoria" TEXT NOT NULL,
    "sector" "Sector" NOT NULL,
    "coeficiente" DOUBLE PRECISION NOT NULL,
    "origen" "OrigenParametro" NOT NULL DEFAULT 'DEFECTO',
    CONSTRAINT "CoeficienteSector_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoeficienteSector_localId_categoria_sector_key" ON "CoeficienteSector"("localId", "categoria", "sector");
CREATE INDEX "CoeficienteSector_categoria_idx" ON "CoeficienteSector"("categoria");
ALTER TABLE "CoeficienteSector" ADD CONSTRAINT "CoeficienteSector_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoeficienteCanal" (
    "id" TEXT NOT NULL,
    "localId" TEXT,
    "canal" TEXT NOT NULL,
    "sector" "Sector" NOT NULL,
    "coeficiente" DOUBLE PRECISION NOT NULL,
    "origen" "OrigenParametro" NOT NULL DEFAULT 'DEFECTO',
    CONSTRAINT "CoeficienteCanal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoeficienteCanal_localId_canal_sector_key" ON "CoeficienteCanal"("localId", "canal", "sector");
ALTER TABLE "CoeficienteCanal" ADD CONSTRAINT "CoeficienteCanal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CapacidadSector" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "sector" "Sector" NOT NULL,
    "capacidadPorEmpleado" DOUBLE PRECISION NOT NULL,
    "minPersonas" INTEGER NOT NULL DEFAULT 0,
    "maxPersonas" INTEGER NOT NULL DEFAULT 10,
    "origen" "OrigenParametro" NOT NULL DEFAULT 'DEFECTO',
    "confianza" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "observaciones" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CapacidadSector_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CapacidadSector_localId_sector_key" ON "CapacidadSector"("localId", "sector");
ALTER TABLE "CapacidadSector" ADD CONSTRAINT "CapacidadSector_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AjusteK" (
    "id" TEXT NOT NULL,
    "localId" TEXT,
    "diaSemana" INTEGER,
    "fecha" DATE,
    "slot" INTEGER,
    "valor" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    CONSTRAINT "AjusteK_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AjusteK_localId_fecha_idx" ON "AjusteK"("localId", "fecha");
ALTER TABLE "AjusteK" ADD CONSTRAINT "AjusteK_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SensibilidadClima" (
    "id" TEXT NOT NULL,
    "tipoLocal" "TipoLocal" NOT NULL,
    "condicion" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "confianza" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dias" INTEGER NOT NULL DEFAULT 0,
    "origen" "OrigenParametro" NOT NULL DEFAULT 'DEFECTO',
    "calculadoEn" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SensibilidadClima_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SensibilidadClima_tipoLocal_condicion_key" ON "SensibilidadClima"("tipoLocal", "condicion");

CREATE TABLE "ClimaDia" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tempMax" DOUBLE PRECISION,
    "tempMin" DOUBLE PRECISION,
    "lluviaMm" DOUBLE PRECISION,
    "vientoKmh" DOUBLE PRECISION,
    "esPronostico" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ClimaDia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClimaDia_localId_fecha_key" ON "ClimaDia"("localId", "fecha");
ALTER TABLE "ClimaDia" ADD CONSTRAINT "ClimaDia_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Pronostico" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "slot" INTEGER,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "demandaBase" DOUBLE PRECISION NOT NULL,
    "kAuto" DOUBLE PRECISION NOT NULL,
    "kManual" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "demandaFinal" DOUBLE PRECISION NOT NULL,
    "kDetalle" JSONB,
    "ticketsPronosticados" DOUBLE PRECISION NOT NULL,
    "unidadesPronosticadas" DOUBLE PRECISION NOT NULL,
    "ventasPronosticadas" DOUBLE PRECISION NOT NULL,
    "demandIndex" DOUBLE PRECISION NOT NULL,
    "ticketsMin" DOUBLE PRECISION,
    "ticketsMax" DOUBLE PRECISION,
    "confianza" DOUBLE PRECISION,
    "cargaPorSector" JSONB,
    "dotacionPorSector" JSONB,
    "ticketsReales" DOUBLE PRECISION,
    "ventasReales" DOUBLE PRECISION,
    "errorTickets" DOUBLE PRECISION,
    CONSTRAINT "Pronostico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Pronostico_localId_fecha_slot_emitidoEn_key" ON "Pronostico"("localId", "fecha", "slot", "emitidoEn");
CREATE INDEX "Pronostico_localId_fecha_idx" ON "Pronostico"("localId", "fecha");
ALTER TABLE "Pronostico" ADD CONSTRAINT "Pronostico_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
