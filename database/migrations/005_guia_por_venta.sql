-- ============================================
-- Migración 005 — Número de guía por VENTA, no por paquete (P12)
-- ============================================
-- Ejecutar UNA sola vez contra una base ya poblada. No tocar init.sql como
-- "migración en vivo": init.sql ya describe el esquema final deseado (para bases
-- nuevas); este script es solo para bases existentes.
--
-- DECISIÓN DE NEGOCIO (instructores + cliente, P12): una venta puede tener varios
-- paquetes, pero todos comparten el mismo número de guía. Antes cada paquete
-- físico tenía su propio numero_guia único; ahora numero_guia se mueve a
-- encomienda_venta (uno por venta) y desaparece de paquete.
--
-- ESTRATEGIA DE MIGRACIÓN DE DATOS (confirmada con el usuario): las ventas
-- existentes con más de un paquete tenían un numero_guia DISTINTO en cada uno.
-- Al fusionar a un solo número por venta se conserva el del paquete MÁS ANTIGUO
-- (id_paquete más bajo) y se descartan los demás — es el más predecible y,
-- para el caso común de un solo paquete, el único que existe.
--
-- Requiere Postgres. Correr dentro de una transacción — si algo falla, no queda
-- a medias. Recomendado: respaldar la base antes de correrlo (pg_dump), ya que
-- descarta permanentemente los numero_guia de todos los paquetes que no eran el
-- más antiguo de su venta.

BEGIN;

ALTER TABLE encomienda_venta ADD COLUMN numero_guia VARCHAR(50);

-- Copia a cada venta el numero_guia de su paquete más antiguo (id_paquete
-- mínimo). DISTINCT ON + ORDER BY id_encomienda_venta, id_paquete se queda con
-- una sola fila (la del paquete más viejo) por cada venta.
UPDATE encomienda_venta ev
SET numero_guia = sub.numero_guia
FROM (
  SELECT DISTINCT ON (id_encomienda_venta) id_encomienda_venta, numero_guia
  FROM paquete
  ORDER BY id_encomienda_venta, id_paquete ASC
) sub
WHERE ev.id_encomienda_venta = sub.id_encomienda_venta;

-- Red de seguridad: una venta sin ningún paquete (no debería existir hoy, ver
-- encomiendasValidator.js — siempre exige al menos uno) se queda sin
-- numero_guia tras el UPDATE de arriba. Antes de poder exigir NOT NULL/UNIQUE,
-- se le asigna un número de emergencia distinguible, para que la migración no
-- falle por un caso así.
UPDATE encomienda_venta
SET numero_guia = 'EE-MIGRADA-' || id_encomienda_venta
WHERE numero_guia IS NULL;

ALTER TABLE encomienda_venta ALTER COLUMN numero_guia SET NOT NULL;
ALTER TABLE encomienda_venta ADD CONSTRAINT encomienda_venta_numero_guia_key UNIQUE (numero_guia);

ALTER TABLE paquete DROP COLUMN numero_guia;

COMMIT;
