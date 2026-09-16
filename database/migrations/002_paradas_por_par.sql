-- ============================================
-- Migración 002 — Paradas propias de cada PAR vehículo+conductor
-- ============================================
-- Ejecutar UNA sola vez, en orden (después de 001_split_ruta_salida.sql), contra
-- una base ya poblada con el esquema viejo de `salida_parada` (FK id_salida,
-- paradas compartidas por TODA la salida). No tocar init.sql como "migración en
-- vivo": init.sql ya describe el esquema final deseado (para bases nuevas); este
-- script es solo para convertir datos existentes.
--
-- DECISIÓN DE NEGOCIO (ruta fraccionada, ver LOGICA.md): las paradas dejan de ser
-- de la salida completa y pasan a ser de cada par vehículo+conductor del convoy —
-- ej. Medellín → Rionegro donde un vehículo del convoy pasa por Guarne y otro va
-- directo a Rionegro.
--
-- LIMITACIÓN CONOCIDA DE ESTA MIGRACIÓN: con el esquema viejo, todas las paradas
-- de una salida eran compartidas por todos sus pares — no hay forma de saber, a
-- partir de los datos existentes, a cuál par correspondía cada parada realmente
-- (esa distinción no existía antes de este cambio). Lo mejor que se puede hacer es
-- migrar cada parada al PRIMER par habilitado de su salida (el de menor
-- id_salida_vehiculo_conductor). Si una salida migrada en realidad tenía un convoy
-- de varios vehículos con paradas que debían quedar repartidas entre ellos, un
-- admin tendrá que revisarlas y reasignarlas a mano desde el panel después de
-- correr esta migración. Una salida sin ningún par habilitado (caso raro: todos
-- sus pares fueron inhabilitados) se queda sin paradas migrables — se documentan
-- al final del script (ver paso 4) y hay que resolverlas a mano.
--
-- Requiere Postgres. Correr dentro de una transacción — si algo falla, no queda a
-- medias.

BEGIN;

-- 1) Agregar la columna nueva (nullable por ahora, se llena en el paso 2).
ALTER TABLE salida_parada ADD COLUMN IF NOT EXISTS id_salida_vehiculo_conductor INTEGER;

-- 2) Cada parada apunta al PRIMER par habilitado (menor id) de la salida a la que
--    pertenecía — ver limitación documentada arriba.
UPDATE salida_parada sp
SET id_salida_vehiculo_conductor = (
  SELECT svc.id_salida_vehiculo_conductor
  FROM salida_vehiculo_conductor svc
  WHERE svc.id_salida = sp.id_salida AND svc.habilitado = true
  ORDER BY svc.id_salida_vehiculo_conductor ASC
  LIMIT 1
)
WHERE sp.id_salida_vehiculo_conductor IS NULL;

-- 3) Paradas que quedaron sin par (salida sin ningún par habilitado) no se pueden
--    migrar con certeza a ningún vehículo/conductor real — se listan para revisión
--    manual antes de continuar (si esta migración corre desatendida, quedarán
--    huérfanas y el paso 5 fallará al poner NOT NULL; revisar el resultado de este
--    SELECT y decidir a mano qué par asignarles, o borrarlas, antes de reintentar).
DO $$
DECLARE
  huerfanas INTEGER;
BEGIN
  SELECT COUNT(*) INTO huerfanas FROM salida_parada WHERE id_salida_vehiculo_conductor IS NULL;
  IF huerfanas > 0 THEN
    RAISE NOTICE 'Migración 002: % parada(s) sin ningún par habilitado en su salida — revisar a mano (SELECT * FROM salida_parada WHERE id_salida_vehiculo_conductor IS NULL) antes de que el paso 5 falle por NOT NULL.', huerfanas;
  END IF;
END $$;

-- 4) Quitar la columna vieja y su FK/índices, y poner la columna nueva NOT NULL.
ALTER TABLE salida_parada DROP CONSTRAINT IF EXISTS salida_parada_id_salida_fkey;
DROP INDEX IF EXISTS uq_parada_salida_destino;
DROP INDEX IF EXISTS uq_parada_salida_orden;
ALTER TABLE salida_parada DROP COLUMN IF EXISTS id_salida;
ALTER TABLE salida_parada ALTER COLUMN id_salida_vehiculo_conductor SET NOT NULL;

-- 5) FK e índices nuevos, scoped por par en vez de por salida — dos pares
--    distintos SÍ pueden compartir una misma parada.
ALTER TABLE salida_parada ADD FOREIGN KEY (id_salida_vehiculo_conductor) REFERENCES salida_vehiculo_conductor (id_salida_vehiculo_conductor);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parada_par_destino ON salida_parada (id_salida_vehiculo_conductor, id_destino);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parada_par_orden ON salida_parada (id_salida_vehiculo_conductor, orden);

COMMIT;
