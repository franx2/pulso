-- CreateEnum
CREATE TYPE "TipoVenta" AS ENUM ('MESA', 'MOSTRADOR', 'DELIVERY');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('EN_CURSO', 'CERRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "MotivoAnulacionItem" AS ENUM ('PEDIDO_DEL_CLIENTE', 'DEMORA_EN_COCINA', 'ERROR', 'CLIENTE_INSATISFECHO', 'CAMBIO_DE_PRODUCTO', 'SIN_STOCK', 'PRUEBA', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoMedioPago" AS ENUM ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'QR', 'CUENTA_CORRIENTE', 'APP_DELIVERY', 'OTRO');

-- CreateEnum
CREATE TYPE "FormaMesa" AS ENUM ('CUADRADA', 'REDONDA');

-- CreateEnum
CREATE TYPE "TamanoMesa" AS ENUM ('CHICA', 'GRANDE');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO', 'EGRESO');

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "rolVentaId" TEXT;

-- CreateTable
CREATE TABLE "RolVenta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "esMozo" BOOLEAN NOT NULL DEFAULT false,
    "permisos" TEXT[],
    "fudoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salon" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fudoId" INTEGER,

    CONSTRAINT "Salon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fila" INTEGER NOT NULL,
    "columna" INTEGER NOT NULL,
    "forma" "FormaMesa" NOT NULL DEFAULT 'CUADRADA',
    "tamano" "TamanoMesa" NOT NULL DEFAULT 'CHICA',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fudoId" INTEGER,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cocina" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fudoId" INTEGER,

    CONSTRAINT "Cocina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaVenta" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "padreId" TEXT,
    "cocinaId" TEXT,
    "fudoId" INTEGER,

    CONSTRAINT "CategoriaVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoVenta" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "precio" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "cocinaId" TEXT,
    "fudoId" INTEGER,

    CONSTRAINT "ProductoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedioPago" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMedioPago" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fudoId" INTEGER,

    CONSTRAINT "MedioPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caja" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT 'Caja principal',
    "abiertaPorId" TEXT NOT NULL,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fondoInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cerradaPorId" TEXT,
    "cerradaEn" TIMESTAMP(3),
    "efectivoContado" DOUBLE PRECISION,
    "comentario" TEXT,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "cajaId" TEXT NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoVenta" NOT NULL,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'EN_CURSO',
    "mesaId" TEXT,
    "mozoId" TEXT,
    "abiertaPorId" TEXT NOT NULL,
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comensales" INTEGER,
    "cliente" TEXT,
    "comentario" TEXT,
    "descuentoPct" DOUBLE PRECISION,
    "descuentoMonto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descuentoMotivo" TEXT,
    "total" DOUBLE PRECISION,
    "cajaId" TEXT,
    "cerradaPorId" TEXT,
    "cerradaEn" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "anuladaEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVenta" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "productoId" TEXT,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "comentario" TEXT,
    "cocinaId" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivoAnulacion" "MotivoAnulacionItem",
    "comentarioAnulacion" TEXT,
    "anuladoPorId" TEXT,
    "anuladoEn" TIMESTAMP(3),

    CONSTRAINT "ItemVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoVenta" (
    "id" TEXT NOT NULL,
    "ventaId" TEXT NOT NULL,
    "medioPagoId" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "propina" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cajaId" TEXT,
    "cobradoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PagoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolVenta_nombre_key" ON "RolVenta"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "RolVenta_fudoId_key" ON "RolVenta"("fudoId");

-- CreateIndex
CREATE UNIQUE INDEX "Salon_localId_fudoId_key" ON "Salon"("localId", "fudoId");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_salonId_numero_key" ON "Mesa"("salonId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Cocina_localId_fudoId_key" ON "Cocina"("localId", "fudoId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaVenta_localId_fudoId_key" ON "CategoriaVenta"("localId", "fudoId");

-- CreateIndex
CREATE INDEX "ProductoVenta_localId_activo_idx" ON "ProductoVenta"("localId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoVenta_localId_fudoId_key" ON "ProductoVenta"("localId", "fudoId");

-- CreateIndex
CREATE UNIQUE INDEX "MedioPago_localId_fudoId_key" ON "MedioPago"("localId", "fudoId");

-- CreateIndex
CREATE INDEX "Caja_localId_cerradaEn_idx" ON "Caja"("localId", "cerradaEn");

-- CreateIndex
CREATE INDEX "Venta_localId_estado_idx" ON "Venta"("localId", "estado");

-- CreateIndex
CREATE INDEX "Venta_localId_abiertaEn_idx" ON "Venta"("localId", "abiertaEn");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_localId_numero_key" ON "Venta"("localId", "numero");

-- CreateIndex
CREATE INDEX "ItemVenta_ventaId_idx" ON "ItemVenta"("ventaId");

-- CreateIndex
CREATE INDEX "PagoVenta_ventaId_idx" ON "PagoVenta"("ventaId");

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_rolVentaId_fkey" FOREIGN KEY ("rolVentaId") REFERENCES "RolVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salon" ADD CONSTRAINT "Salon_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cocina" ADD CONSTRAINT "Cocina_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaVenta" ADD CONSTRAINT "CategoriaVenta_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaVenta" ADD CONSTRAINT "CategoriaVenta_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "CategoriaVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaVenta" ADD CONSTRAINT "CategoriaVenta_cocinaId_fkey" FOREIGN KEY ("cocinaId") REFERENCES "Cocina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoVenta" ADD CONSTRAINT "ProductoVenta_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoVenta" ADD CONSTRAINT "ProductoVenta_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaVenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoVenta" ADD CONSTRAINT "ProductoVenta_cocinaId_fkey" FOREIGN KEY ("cocinaId") REFERENCES "Cocina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedioPago" ADD CONSTRAINT "MedioPago_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_mozoId_fkey" FOREIGN KEY ("mozoId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_anuladaPorId_fkey" FOREIGN KEY ("anuladaPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenta" ADD CONSTRAINT "ItemVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenta" ADD CONSTRAINT "ItemVenta_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenta" ADD CONSTRAINT "ItemVenta_cocinaId_fkey" FOREIGN KEY ("cocinaId") REFERENCES "Cocina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenta" ADD CONSTRAINT "ItemVenta_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenta" ADD CONSTRAINT "ItemVenta_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_medioPagoId_fkey" FOREIGN KEY ("medioPagoId") REFERENCES "MedioPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_cobradoPorId_fkey" FOREIGN KEY ("cobradoPorId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una mesa no puede tener dos ventas en curso. Prisma no declara índices
-- parciales, así que va acá a mano.
CREATE UNIQUE INDEX "Venta_mesa_en_curso_key" ON "Venta"("mesaId") WHERE "estado" = 'EN_CURSO' AND "mesaId" IS NOT NULL;
