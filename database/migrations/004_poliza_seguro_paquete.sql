-- ============================================
-- Migración 004 — Póliza de seguro por paquete (1% del valor declarado)
-- ============================================
-- Ejecutar UNA sola vez contra una base ya poblada. No tocar init.sql como
-- "migración en vivo": init.sql ya describe el esquema final deseado (para bases
-- nuevas); este script es solo para bases existentes.
--
-- DECISIÓN DE NEGOCIO: el cliente confirmó una póliza de seguro OPCIONAL del 1%
-- sobre el valor declarado de la mercancía, aplicada por paquete individual (no
-- por venta completa) — cada paquete puede tener o no la póliza de forma
-- independiente. valor_poliza queda NULL cuando no se contrata; cuando sí, se
-- calcula en el backend (nunca se confía en el 1% que mande el cliente).
--
-- Requiere Postgres. Correr dentro de una transacción — si algo falla, no queda a
-- medias.

BEGIN;

ALTER TABLE paquete ADD COLUMN valor_declarado DECIMAL(12,2);
ALTER TABLE paquete ADD COLUMN valor_poliza DECIMAL(12,2);

COMMIT;
