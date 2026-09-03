-- CreateTable
CREATE TABLE "DemandaHoraria" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "hora" INTEGER NOT NULL,
    "ventasProm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DemandaHoraria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemandaHoraria_localId_diaSemana_hora_key" ON "DemandaHoraria"("localId", "diaSemana", "hora");

-- AddForeignKey
ALTER TABLE "DemandaHoraria" ADD CONSTRAINT "DemandaHoraria_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
