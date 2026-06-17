-- ============================================================
-- ROL SOLO LECTURA PARA LOOKER STUDIO
-- Ejecutar manualmente en el ambiente donde se publiquen las vistas BI.
-- No otorga permisos sobre tablas base.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'looker_readonly'
  ) THEN
    CREATE ROLE looker_readonly LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO looker_readonly;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM looker_readonly;

GRANT SELECT ON
  vw_censo_mensual,
  vw_cumplimiento_controles_prenatales,
  vw_riesgo_obstetrico
TO looker_readonly;
