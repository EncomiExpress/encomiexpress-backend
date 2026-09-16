-- ============================================
-- Migración 001 — Rutas reutilizables (plantilla) + Salidas Programadas (agenda)
-- ============================================
-- Ejecutar UNA sola vez, en orden, contra una base ya poblada con el esquema
-- viejo (ruta con fecha/hora/estado/id_ruta_ida + ruta_vehiculo_conductor +
-- ruta_parada). No tocar init.sql como "migración en vivo": init.sql ya
-- describe el esquema final deseado (para bases nuevas); este script es solo
-- para convertir datos existentes.
--
-- Estrategia: cada fila vieja de `ruta` se parte en dos filas nuevas:
--   - una `ruta` (plantilla: solo id_destino/observaciones/habilitado)
--   - una `salida_programada` (agenda: fecha/hora/estado/id_salida_ida), con
--     el mismo id numérico que la ruta vieja para que el mapeo 1:1 sea trivial
--     (usamos OVERRIDING SYSTEM VALUE para preservar los ids).
--
-- Requiere Postgres (IDENTITY, OVERRIDING SYSTEM VALUE). Correr dentro de una
-- transacción — si algo falla, no queda a medias.

BEGIN;

-- 1) Crear las tablas nuevas (si este script corre contra una base que todavía
--    tiene el esquema viejo intacto, `ruta` ya existe con las columnas viejas;
--    la reducimos después de copiar los datos).

CREATE TABLE IF NOT EXISTS salida_programada (
  id_salida             INTEGER PRIMARY KEY,
  id_ruta               INTEGER NOT NULL,
  id_salida_ida         INTEGER,
  origen                VARCHAR(150) DEFAULT 'Medellín',
  hora_salida           TIME,
  hora_llegada_estimada TIME,
  fecha_salida          DATE,
  fecha_llegada_estimada DATE,
  estado                VARCHAR(30) NOT NULL DEFAULT 'Programada',
  observaciones         TEXT,
  habilitado            BOOLEAN NOT NULL DEFAULT true,
  fecha_creacion        DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 2) Copiar cada ruta vieja a salida_programada, preservando el id (id_salida =
--    id_ruta original) para que el resto de la migración pueda mapear 1:1 sin
--    tablas de traducción de ids.
INSERT INTO salida_programada (
  id_salida, id_ruta, id_salida_ida, origen, hora_salida, hora_llegada_estimada,
  fecha_salida, fecha_llegada_estimada, estado, observaciones, habilitado, fecha_creacion
)
SELECT
  r.id_ruta, r.id_ruta, r.id_ruta_ida, r.origen, r.hora_salida, r.hora_llegada_estimada,
  r.fecha_salida, r.fecha_llegada_estimada, r.estado, r.observaciones, r.habilitado, r.fecha_creacion
FROM ruta r;

-- 3) Renombrar/migrar ruta_parada -> salida_parada (mismo id_salida = id_ruta viejo).
CREATE TABLE IF NOT EXISTS salida_parada (
  id_salida_parada        INTEGER PRIMARY KEY,
  id_salida               INTEGER NOT NULL,
  id_destino              INTEGER NOT NULL,
  orden                   INTEGER NOT NULL
);

INSERT INTO salida_parada (id_salida_parada, id_salida, id_destino, orden)
SELECT rp.id_ruta_parada, rp.id_ruta, rp.id_destino, rp.orden
FROM ruta_parada rp;

-- 4) Renombrar/migrar ruta_vehiculo_conductor -> salida_vehiculo_conductor.
CREATE TABLE IF NOT EXISTS salida_vehiculo_conductor (
  id_salida_vehiculo_conductor INTEGER PRIMARY KEY,
  id_salida     INTEGER NOT NULL,
  id_vehiculo   INTEGER NOT NULL,
  id_conductor  INTEGER NOT NULL,
  habilitado    BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO salida_vehiculo_conductor (
  id_salida_vehiculo_conductor, id_salida, id_vehiculo, id_conductor, habilitado
)
SELECT rvc.id_ruta_vehiculo_conductor, rvc.id_ruta, rvc.id_vehiculo, rvc.id_conductor, rvc.habilitado
FROM ruta_vehiculo_conductor rvc;

-- 5) Repuntar las FKs que hoy apuntan a `ruta`/`ruta_vehiculo_conductor` para
--    que apunten a las nuevas tablas — el valor numérico no cambia porque
--    preservamos los ids en los pasos 2-4, solo agregamos las columnas nuevas.
ALTER TABLE encomienda_venta ADD COLUMN IF NOT EXISTS id_salida INTEGER;
UPDATE encomienda_venta SET id_salida = id_ruta;
ALTER TABLE encomienda_venta ALTER COLUMN id_salida SET NOT NULL;

ALTER TABLE anticipo_excedente ADD COLUMN IF NOT EXISTS id_salida INTEGER;
UPDATE anticipo_excedente SET id_salida = id_ruta;
ALTER TABLE anticipo_excedente ALTER COLUMN id_salida SET NOT NULL;

ALTER TABLE paquete ADD COLUMN IF NOT EXISTS id_salida_vehiculo_conductor INTEGER;
UPDATE paquete SET id_salida_vehiculo_conductor = id_ruta_vehiculo_conductor;
ALTER TABLE paquete ALTER COLUMN id_salida_vehiculo_conductor SET NOT NULL;

-- 6) Soltar las columnas/tablas viejas y reducir `ruta` a plantilla pura.
ALTER TABLE encomienda_venta DROP CONSTRAINT IF EXISTS encomienda_venta_id_ruta_fkey;
ALTER TABLE encomienda_venta DROP COLUMN IF EXISTS id_ruta;

ALTER TABLE anticipo_excedente DROP CONSTRAINT IF EXISTS anticipo_excedente_id_ruta_fkey;
ALTER TABLE anticipo_excedente DROP COLUMN IF EXISTS id_ruta;

ALTER TABLE paquete DROP CONSTRAINT IF EXISTS paquete_id_ruta_vehiculo_conductor_fkey;
ALTER TABLE paquete DROP COLUMN IF EXISTS id_ruta_vehiculo_conductor;

DROP TABLE IF EXISTS ruta_vehiculo_conductor;
DROP TABLE IF EXISTS ruta_parada;

ALTER TABLE ruta DROP CONSTRAINT IF EXISTS ruta_id_ruta_ida_fkey;
ALTER TABLE ruta DROP COLUMN IF EXISTS id_ruta_ida;
ALTER TABLE ruta DROP COLUMN IF EXISTS origen;
ALTER TABLE ruta DROP COLUMN IF EXISTS hora_salida;
ALTER TABLE ruta DROP COLUMN IF EXISTS hora_llegada_estimada;
ALTER TABLE ruta DROP COLUMN IF EXISTS fecha_salida;
ALTER TABLE ruta DROP COLUMN IF EXISTS fecha_llegada_estimada;
ALTER TABLE ruta DROP COLUMN IF EXISTS estado;

-- 7) FKs y unique indexes de las tablas nuevas.
ALTER TABLE salida_programada ADD FOREIGN KEY (id_ruta) REFERENCES ruta (id_ruta);
ALTER TABLE salida_programada ADD FOREIGN KEY (id_salida_ida) REFERENCES salida_programada (id_salida);
CREATE UNIQUE INDEX IF NOT EXISTS uq_salida_ida ON salida_programada (id_salida_ida) WHERE id_salida_ida IS NOT NULL;

ALTER TABLE salida_parada ADD FOREIGN KEY (id_salida) REFERENCES salida_programada (id_salida);
ALTER TABLE salida_parada ADD FOREIGN KEY (id_destino) REFERENCES destino (id_destino);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parada_salida_destino ON salida_parada (id_salida, id_destino);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parada_salida_orden ON salida_parada (id_salida, orden);

ALTER TABLE salida_vehiculo_conductor ADD FOREIGN KEY (id_salida) REFERENCES salida_programada (id_salida);
ALTER TABLE salida_vehiculo_conductor ADD FOREIGN KEY (id_vehiculo) REFERENCES vehiculo (id_vehiculo);
ALTER TABLE salida_vehiculo_conductor ADD FOREIGN KEY (id_conductor) REFERENCES conductor (id_conductor);
CREATE UNIQUE INDEX IF NOT EXISTS uq_svc_salida_vehiculo_activo ON salida_vehiculo_conductor (id_salida, id_vehiculo) WHERE habilitado = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_svc_salida_conductor_activo ON salida_vehiculo_conductor (id_salida, id_conductor) WHERE habilitado = true;

ALTER TABLE encomienda_venta ADD FOREIGN KEY (id_salida) REFERENCES salida_programada (id_salida);
ALTER TABLE anticipo_excedente ADD FOREIGN KEY (id_salida) REFERENCES salida_programada (id_salida);
ALTER TABLE paquete ADD FOREIGN KEY (id_salida_vehiculo_conductor) REFERENCES salida_vehiculo_conductor (id_salida_vehiculo_conductor);

-- 8) Ajustar la secuencia de id_salida para que el próximo INSERT (sin id
--    explícito) siga después del máximo id_ruta migrado, ya que reusamos esos
--    ids con PRIMARY KEY plano (sin IDENTITY) en este script. Convertimos la
--    columna a IDENTITY apuntando a partir de ese máximo.
DO $$
DECLARE
  max_id INTEGER;
BEGIN
  SELECT COALESCE(MAX(id_salida), 0) INTO max_id FROM salida_programada;
  EXECUTE format(
    'ALTER TABLE salida_programada ALTER COLUMN id_salida ADD GENERATED BY DEFAULT AS IDENTITY (START WITH %s)',
    max_id + 1
  );
END $$;

DO $$
DECLARE
  max_id INTEGER;
BEGIN
  SELECT COALESCE(MAX(id_salida_parada), 0) INTO max_id FROM salida_parada;
  EXECUTE format(
    'ALTER TABLE salida_parada ALTER COLUMN id_salida_parada ADD GENERATED BY DEFAULT AS IDENTITY (START WITH %s)',
    max_id + 1
  );
END $$;

DO $$
DECLARE
  max_id INTEGER;
BEGIN
  SELECT COALESCE(MAX(id_salida_vehiculo_conductor), 0) INTO max_id FROM salida_vehiculo_conductor;
  EXECUTE format(
    'ALTER TABLE salida_vehiculo_conductor ALTER COLUMN id_salida_vehiculo_conductor ADD GENERATED BY DEFAULT AS IDENTITY (START WITH %s)',
    max_id + 1
  );
END $$;

-- 9) Vistas de disponibilidad (idénticas a las de init.sql).
CREATE OR REPLACE VIEW vista_conductores_disponibles AS
SELECT c.*
FROM conductor c
WHERE c.habilitado = true
  AND NOT EXISTS (
    SELECT 1
    FROM salida_vehiculo_conductor svc
    JOIN salida_programada sp ON sp.id_salida = svc.id_salida
    LEFT JOIN salida_programada sp_vuelta ON sp_vuelta.id_salida_ida = sp.id_salida
    WHERE svc.id_conductor = c.id_conductor
      AND svc.habilitado = true
      AND (
        sp.estado IN ('Programada', 'En Ruta')
        OR sp_vuelta.estado IN ('Programada', 'En Ruta')
      )
  );

CREATE OR REPLACE VIEW vista_vehiculos_disponibles AS
SELECT v.*
FROM vehiculo v
WHERE v.habilitado = true
  AND NOT EXISTS (
    SELECT 1
    FROM salida_vehiculo_conductor svc
    JOIN salida_programada sp ON sp.id_salida = svc.id_salida
    LEFT JOIN salida_programada sp_vuelta ON sp_vuelta.id_salida_ida = sp.id_salida
    WHERE svc.id_vehiculo = v.id_vehiculo
      AND svc.habilitado = true
      AND (
        sp.estado IN ('Programada', 'En Ruta')
        OR sp_vuelta.estado IN ('Programada', 'En Ruta')
      )
  );

COMMIT;
