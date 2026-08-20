-- ============================================
-- Migración: eliminar el estado intermedio 'En reparto' de paquete.
-- Correr una sola vez contra una base de datos ya desplegada con el
-- esquema anterior (database/init.sql ya viene actualizado para instalaciones
-- nuevas). El estado 'En reparto' quedaba en la práctica inalcanzable (el
-- endpoint que lo asignaba, marcar-reparto, nunca funcionó), así que se
-- elimina del flujo: ahora el conductor marca directo Entregado/Devuelto en
-- cuanto la ruta pasa a "En Ruta".
-- ============================================

UPDATE paquete SET estado = 'Por entregar' WHERE estado = 'En reparto';

COMMENT ON COLUMN paquete.estado IS 'Por entregar | Entregado | Devuelto';

-- El historial de cambios se guardaba en historial_estado, pero nunca se
-- mostraba en ningún lado (ni web ni móvil) — solo se escribía. Se elimina.
ALTER TABLE paquete DROP COLUMN IF EXISTS historial_estado;
