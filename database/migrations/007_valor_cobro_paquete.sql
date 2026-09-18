-- ============================================
-- Migración 007 — Valor a cobrar por paquete (paquete.valor_cobro)
-- ============================================
-- Ejecutar UNA sola vez contra una base ya poblada. No tocar init.sql como
-- "migración en vivo": init.sql ya describe el esquema final deseado (para bases
-- nuevas); este script es solo para bases existentes.
--
-- DECISIÓN DE NEGOCIO: en Contraentrega el distribuidor cobra paquete por paquete
-- (registrarEntregaFinal deja cada uno 'Pagado' al entregarlo), pero la venta solo
-- guardaba UN total. Para que la app del distribuidor pueda mostrar lo que le falta
-- por cobrar a medida que va entregando, cada paquete necesita su propio valor.
-- valor_cobro es la parte del total de la venta que le toca a ese paquete; los de una
-- venta suman exactamente su total (ver src/utils/repartoTotal.js).
--
-- Ventas ya existentes se quedan con valor_cobro NULL (no se recalcula nada a
-- ciegas): la app móvil, si un paquete no trae valor, muestra el total de la venta
-- como antes. Se llena solo al registrar o editar una venta.
--
-- Requiere Postgres. Correr dentro de una transacción — si algo falla, no queda a
-- medias.

BEGIN;

ALTER TABLE paquete ADD COLUMN valor_cobro DECIMAL(12,2);

COMMENT ON COLUMN paquete.valor_cobro IS 'Parte del total de la venta (encomienda_venta.total) que le toca a ESTE paquete — lo que el distribuidor cobra al entregarlo en Contraentrega. La suma de los paquetes de una venta = su total. NULL en ventas anteriores a la migración 007.';

COMMIT;
