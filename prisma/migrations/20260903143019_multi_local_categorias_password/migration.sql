-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "categoriaId" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "HorarioLocal" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "abre" TEXT,
    "cierra" TEXT,

    CONSTRAINT "HorarioLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HorarioLocal_localId_diaSemana_key" ON "HorarioLocal"("localId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_localId_nombre_key" ON "Categoria"("localId", "nombre");

-- AddForeignKey
ALTER TABLE "HorarioLocal" ADD CONSTRAINT "HorarioLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
