SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  filas_existentes BIGINT;
BEGIN
  IF to_regclass('public.referencias_efectuadas') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'LOCK TABLE public.referencias_efectuadas IN ACCESS EXCLUSIVE MODE';
  EXECUTE 'SELECT COUNT(*) FROM public.referencias_efectuadas'
    INTO filas_existentes;

  RAISE NOTICE 'public.referencias_efectuadas: % fila(s)', filas_existentes;

  IF filas_existentes > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = format(
        'Migracion 008 abortada: public.referencias_efectuadas contiene %s fila(s); no se eliminaron datos.',
        filas_existentes
      );
  END IF;

  DROP TABLE public.referencias_efectuadas;

  IF to_regclass('public.referencias_efectuadas') IS NOT NULL THEN
    RAISE EXCEPTION 'Migracion 008 abortada: no se pudo retirar public.referencias_efectuadas.';
  END IF;
END
$migration$;
