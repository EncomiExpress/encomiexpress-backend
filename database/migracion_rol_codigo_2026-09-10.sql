-- ============================================
-- Migración: Rol.codigo — nombre libremente editable sin romper autorización
-- Idempotente — segura de correr más de una vez contra la misma BD.
-- Aplicar contra producción/Supabase; en local, init.sql ya la incluye.
-- ============================================
--
-- Por qué: antes de esta migración, todo el código de autorización y de
-- negocio comparaba el rol de un usuario contra el NOMBRE ('admin',
-- 'conductor', 'distribuidor', 'operador_sede') — renombrar cualquiera de
-- ellos desde el panel rompía en cascada: rutas devolviendo 403, filtros de
-- sede sin aplicarse, UX condicional mostrando lo que no debía. `codigo` es
-- un identificador estable que nunca se expone para editar; `nombre` queda
-- libre para renombrarse a cualquier cosa (incluido 'admin').

ALTER TABLE rol ADD COLUMN IF NOT EXISTS codigo VARCHAR(30);

-- Backfill: los 4 roles del sistema siguen con su nombre original tal como
-- los sembró init.sql/la migración de sedes remotas (nadie los ha podido
-- renombrar aún — 'admin' estaba bloqueado por completo, y para los otros
-- tres no existía ningún motivo previo para tocarlos).
UPDATE rol SET codigo = 'admin'         WHERE nombre = 'admin'         AND codigo IS NULL;
UPDATE rol SET codigo = 'conductor'     WHERE nombre = 'conductor'     AND codigo IS NULL;
UPDATE rol SET codigo = 'distribuidor'  WHERE nombre = 'distribuidor'  AND codigo IS NULL;
UPDATE rol SET codigo = 'operador_sede' WHERE nombre = 'operador_sede' AND codigo IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rol_codigo_key') THEN
    ALTER TABLE rol ADD CONSTRAINT rol_codigo_key UNIQUE (codigo);
  END IF;
END $$;
