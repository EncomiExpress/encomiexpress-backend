-- ============================================
-- Migración: estados de paquete/venta + renombre de ruta.nombre_ruta a origen
-- + unificación de "En Curso"/"En Tránsito" a "En Ruta" en ruta y venta
-- Correr una sola vez contra una base de datos ya desplegada con el
-- esquema anterior (database/init.sql ya viene actualizado para instalaciones nuevas).
-- ============================================

-- 1) Paquete: fusiona "No entregado" en "Por entregar" y renombra "Devuelto a bodega" a "Devuelto"
UPDATE paquete SET estado = 'Por entregar' WHERE estado = 'No entregado';
UPDATE paquete SET estado = 'Devuelto' WHERE estado = 'Devuelto a bodega';

-- 2) Ruta: nombre_ruta -> origen, con dato base "Medellín"
ALTER TABLE ruta RENAME COLUMN nombre_ruta TO origen;
ALTER TABLE ruta ALTER COLUMN origen SET DEFAULT 'Medellín';
UPDATE ruta SET origen = 'Medellín' WHERE origen IS NULL OR btrim(origen) = '';

-- 3) Conductor/Vehículo: alinear default de estado con el vocabulario real de la app
ALTER TABLE conductor ALTER COLUMN estado SET DEFAULT 'Disponible';
ALTER TABLE vehiculo  ALTER COLUMN estado SET DEFAULT 'Disponible';

-- 4) Ruta/Venta: unifica el nombre del estado "activo por una ruta en curso" en
-- "En Ruta" para las 4 entidades (Ruta, Conductor, Vehículo, Venta), que antes
-- usaban palabras distintas para lo mismo ("En Curso" / "En Tránsito").
UPDATE ruta             SET estado = 'En Ruta' WHERE estado = 'En Curso';
UPDATE encomienda_venta SET estado = 'En Ruta' WHERE estado = 'En Tránsito';

-- 5) Documentación (no afecta datos)
COMMENT ON COLUMN encomienda_venta.estado IS 'Programada | En Ruta | Entregada | Completada con novedades | Cancelada';
COMMENT ON COLUMN ruta.estado IS 'Programada | En Ruta | Completada | Cancelada';
COMMENT ON COLUMN ruta.origen IS 'Ciudad de origen de la ruta (texto libre, dato base: Medellín)';
COMMENT ON COLUMN paquete.estado IS 'Por entregar | En reparto | Entregado | Devuelto';
