-- Cuentas creadas desde la pantalla de ingreso, esperando que un admin las active.
ALTER TABLE "Empleado" ADD COLUMN "pendienteDesde" TIMESTAMP(3);
