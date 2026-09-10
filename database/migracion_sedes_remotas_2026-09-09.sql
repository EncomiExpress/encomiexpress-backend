-- ============================================
-- Migración: Sedes remotas — acceso web restringido (operador_sede)
-- Idempotente — segura de correr más de una vez contra la misma BD.
-- Aplicar contra producción/Supabase; en local, init.sql ya la incluye.
-- Ver LOGICA.md, "Sedes remotas — acceso web restringido (operador_sede)".
-- ============================================

-- Rol nuevo
INSERT INTO rol (nombre, descripcion)
SELECT 'operador_sede', 'Operador de sede remota — dispara el regreso, registra sus ventas y gestiona sus propios clientes; solo lectura del resto. Panel web.'
WHERE NOT EXISTS (SELECT 1 FROM rol WHERE nombre = 'operador_sede');

-- Permiso nuevo
INSERT INTO permiso (nombre, descripcion, habilitado)
SELECT 'programar_regreso_sede', 'Disparar la ruta de regreso de su sede', true
WHERE NOT EXISTS (SELECT 1 FROM permiso WHERE nombre = 'programar_regreso_sede');

-- El admin (id_rol = 1) recibe automáticamente todo permiso nuevo, igual que el
-- resto de la base de permisos — mismo patrón que init.sql.
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT 1, p.id_permiso
FROM permiso p
WHERE p.nombre = 'programar_regreso_sede'
  AND NOT EXISTS (
    SELECT 1 FROM rol_permiso rp WHERE rp.id_rol = 1 AND rp.id_permiso = p.id_permiso
  );

-- Permisos de 'operador_sede': Ventas/Rutas de solo lectura + la acción de
-- regreso + Clientes completo.
INSERT INTO rol_permiso (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM rol r, permiso p
WHERE r.nombre = 'operador_sede' AND p.nombre IN (
  'listar_venta', 'registrar_venta', 'consultar_venta',
  'listar_ruta', 'consultar_ruta', 'programar_regreso_sede',
  'listar_cliente', 'registrar_cliente', 'consultar_cliente',
  'actualizar_cliente', 'inhabilitar_cliente'
)
AND NOT EXISTS (
  SELECT 1 FROM rol_permiso rp WHERE rp.id_rol = r.id_rol AND rp.id_permiso = p.id_permiso
);

-- Columnas nuevas: "sede que registró el registro" — NULL = registrado desde
-- Medellín. No es un tenant; distinto de cliente.id_destino (municipio de
-- devolución del remitente, ya existente).
ALTER TABLE encomienda_venta ADD COLUMN IF NOT EXISTS id_sede INTEGER;
ALTER TABLE cliente          ADD COLUMN IF NOT EXISTS id_sede INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'encomienda_venta_id_sede_fkey'
  ) THEN
    ALTER TABLE encomienda_venta ADD CONSTRAINT encomienda_venta_id_sede_fkey
      FOREIGN KEY (id_sede) REFERENCES destino (id_destino);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cliente_id_sede_fkey'
  ) THEN
    ALTER TABLE cliente ADD CONSTRAINT cliente_id_sede_fkey
      FOREIGN KEY (id_sede) REFERENCES destino (id_destino);
  END IF;
END $$;
