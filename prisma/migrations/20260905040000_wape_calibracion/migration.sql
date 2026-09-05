-- El cron semanal ya corre un backtest por ventana candidata para elegir la
-- ventana; guardar lo que midió evita que la pantalla del modelo lo repita en
-- cada carga. Va en una sola columna JSON porque son varias métricas de la
-- misma medición y siempre se leen juntas.
ALTER TABLE "Local" ADD COLUMN "ventanaCalibracion" JSONB;
