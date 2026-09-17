-- ============================================
-- Migración 006 — id_destino único en ruta (blindaje anti-duplicados)
-- ============================================
-- Ejecutar UNA sola vez contra una base ya poblada. No tocar init.sql como
-- "migración en vivo": init.sql ya describe el esquema final deseado (para bases
-- nuevas); este script es solo para bases existentes.
--
-- rutaService.create()/update() ya rechazan crear/mover una ruta hacia un
-- destino que otra ruta ya cubre ("Ya existe una ruta registrada hacia ese
-- destino") -- una plantilla por corredor, reutilizable indefinidamente. Esta
-- migración respalda esa misma regla a nivel de base de datos: sin un UNIQUE,
-- dos solicitudes de creación casi simultáneas podían colarse entre el
-- chequeo y el INSERT y dejar dos rutas apuntando al mismo destino.
--
-- Si esta migración falla con "duplicate key value violates unique
-- constraint", significa que ya existen rutas duplicadas hacia el mismo
-- destino (no debería pasar dado el chequeo de la app, pero por si acaso) --
-- hay que decidir con el negocio cuál de las duplicadas conservar,
-- reasignar sus salidas (`UPDATE salida_programada SET id_ruta = ...`) e
-- inhabilitar/borrar las sobrantes antes de reintentar.
--
-- Requiere Postgres. Correr dentro de una transacción — si algo falla, no
-- queda a medias.

BEGIN;

ALTER TABLE ruta ADD CONSTRAINT ruta_id_destino_key UNIQUE (id_destino);

COMMIT;
