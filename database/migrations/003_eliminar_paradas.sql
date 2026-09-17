-- ============================================
-- Migración 003 — Eliminar paradas (rutas directas)
-- ============================================
-- Ejecutar UNA sola vez, en orden (después de 002_paradas_por_par.sql), contra una
-- base ya poblada con `salida_parada`. No tocar init.sql como "migración en vivo":
-- init.sql ya describe el esquema final deseado (para bases nuevas); este script es
-- solo para bases existentes.
--
-- DECISIÓN DE NEGOCIO (2026-09-16): el negocio dejó de operar rutas fraccionadas —
-- todas las rutas son ahora directas (Medellín -> destino final, sin paradas
-- intermedias). El concepto de "parada" desaparece del todo: `salida_parada` es
-- tabla hija limpia (solo dos FK salientes, nada más depende de ella), así que el
-- DROP es directo, sin necesidad de migrar datos a otro lado. Si se quiere
-- conservar el histórico de paradas antes de borrar, respaldar la tabla aparte
-- antes de correr este script (ej. `CREATE TABLE salida_parada_historico AS TABLE
-- salida_parada;`).
--
-- Requiere Postgres. Correr dentro de una transacción — si algo falla, no queda a
-- medias.

BEGIN;

DROP TABLE IF EXISTS salida_parada;

COMMIT;
