// Script de bootstrap para producción: crea roles, permisos y el usuario admin
// inicial contra la base de datos apuntada por las variables de entorno activas
// (.env) — a diferencia de POST /api/seed (app.js), que está bloqueado en
// producción a propósito y siempre resetea la contraseña del admin a
// 'admin123'. Este script está pensado para correr UNA sola vez, manualmente,
// antes de que el sistema reciba tráfico real:
//
//   npm run db:seed
//
// La contraseña del admin NUNCA se hardcodea aquí ni queda en git: se toma de
// la variable de entorno ADMIN_INITIAL_PASSWORD. Si no se define, se usa
// 'admin123' solo como conveniencia en entornos de desarrollo local (con aviso
// en consola para que no pase desapercibido).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, Rol, Permiso, RolPermiso, Usuario } = require('../models');

const PERMISOS = [
  { nombre: 'listar_usuario', descripcion: 'Listar usuarios' },
  { nombre: 'registrar_usuario', descripcion: 'Registrar usuarios' },
  { nombre: 'consultar_usuario', descripcion: 'Consultar usuarios' },
  { nombre: 'actualizar_usuario', descripcion: 'Actualizar usuarios' },
  { nombre: 'inhabilitar_usuario', descripcion: 'Inhabilitar usuarios' },
  { nombre: 'listar_rol', descripcion: 'Listar roles' },
  { nombre: 'registrar_rol', descripcion: 'Registrar roles' },
  { nombre: 'consultar_rol', descripcion: 'Consultar roles' },
  { nombre: 'actualizar_rol', descripcion: 'Actualizar roles' },
  { nombre: 'inhabilitar_rol', descripcion: 'Inhabilitar roles' },
  { nombre: 'listar_cliente', descripcion: 'Listar clientes' },
  { nombre: 'registrar_cliente', descripcion: 'Registrar clientes' },
  { nombre: 'consultar_cliente', descripcion: 'Consultar clientes' },
  { nombre: 'actualizar_cliente', descripcion: 'Actualizar clientes' },
  { nombre: 'inhabilitar_cliente', descripcion: 'Inhabilitar clientes' },
  { nombre: 'listar_vehiculo', descripcion: 'Listar vehículos' },
  { nombre: 'registrar_vehiculo', descripcion: 'Registrar vehículos' },
  { nombre: 'consultar_vehiculo', descripcion: 'Consultar vehículos' },
  { nombre: 'actualizar_vehiculo', descripcion: 'Actualizar vehículos' },
  { nombre: 'inhabilitar_vehiculo', descripcion: 'Inhabilitar vehículos' },
  { nombre: 'listar_conductor', descripcion: 'Listar conductores' },
  { nombre: 'registrar_conductor', descripcion: 'Registrar conductores' },
  { nombre: 'consultar_conductor', descripcion: 'Consultar conductores' },
  { nombre: 'actualizar_conductor', descripcion: 'Actualizar conductores' },
  { nombre: 'inhabilitar_conductor', descripcion: 'Inhabilitar conductores' },
  { nombre: 'listar_destino', descripcion: 'Listar destinos' },
  { nombre: 'registrar_destino', descripcion: 'Registrar destinos' },
  { nombre: 'consultar_destino', descripcion: 'Consultar destinos' },
  { nombre: 'actualizar_destino', descripcion: 'Actualizar destinos' },
  { nombre: 'inhabilitar_destino', descripcion: 'Inhabilitar destinos' },
  { nombre: 'listar_ruta', descripcion: 'Listar rutas' },
  { nombre: 'registrar_ruta', descripcion: 'Registrar rutas' },
  { nombre: 'consultar_ruta', descripcion: 'Consultar rutas' },
  { nombre: 'actualizar_ruta', descripcion: 'Actualizar rutas' },
  { nombre: 'inhabilitar_ruta', descripcion: 'Inhabilitar rutas' },
  { nombre: 'listar_anticipo', descripcion: 'Listar anticipos' },
  { nombre: 'registrar_anticipo', descripcion: 'Registrar anticipos' },
  { nombre: 'consultar_anticipo', descripcion: 'Consultar anticipos' },
  { nombre: 'actualizar_anticipo', descripcion: 'Actualizar anticipos' },
  { nombre: 'inhabilitar_anticipo', descripcion: 'Inhabilitar anticipos' },
  { nombre: 'listar_venta', descripcion: 'Listar ventas' },
  { nombre: 'registrar_venta', descripcion: 'Registrar ventas' },
  { nombre: 'consultar_venta', descripcion: 'Consultar ventas' },
  { nombre: 'actualizar_venta', descripcion: 'Actualizar ventas' },
  { nombre: 'inhabilitar_venta', descripcion: 'Inhabilitar ventas' },
  { nombre: 'listar_propietario', descripcion: 'Listar propietarios' },
  { nombre: 'registrar_propietario', descripcion: 'Registrar propietarios' },
  { nombre: 'consultar_propietario', descripcion: 'Consultar propietarios' },
  { nombre: 'actualizar_propietario', descripcion: 'Actualizar propietarios' },
  { nombre: 'inhabilitar_propietario', descripcion: 'Inhabilitar propietarios' },
  { nombre: 'ver_dashboard', descripcion: 'Ver dashboard' },
];

const run = async () => {
  await sequelize.authenticate();

  const existingRoles = await Rol.count();
  if (existingRoles === 0) {
    const roles = await Rol.bulkCreate([
      { nombre: 'admin', descripcion: 'Administrador del sistema con acceso total', habilitado: true },
      { nombre: 'conductor', descripcion: 'Conductor de vehículo', habilitado: true },
    ]);
    const permisos = await Permiso.bulkCreate(PERMISOS.map(p => ({ ...p, habilitado: true })));
    const adminRol = roles[0];
    await RolPermiso.bulkCreate(permisos.map(p => ({ idRol: adminRol.idRol, idPermiso: p.idPermiso })));
    console.log('Roles y permisos creados.');
  } else {
    console.log('Ya existen roles — se omite la creación de roles/permisos.');
  }

  const existingAdmin = await Usuario.findOne({ where: { email: 'admin@encomiexpress.com' } });
  if (existingAdmin) {
    console.log('El usuario admin ya existe — no se toca (no se resetea su contraseña).');
  } else {
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!password) {
      console.warn('ADMIN_INITIAL_PASSWORD no está definida — usando "admin123" solo para desarrollo. Cámbiala apenas inicies sesión.');
    }
    const hashedPassword = await bcrypt.hash(password || 'admin123', 10);
    await Usuario.create({
      idRol: 1,
      tipoIdentificacion: 'CC',
      numeroIdentificacion: '12345678',
      nombre: 'Administrador',
      apellido: 'Sistema',
      telefono: '3000000000',
      email: 'admin@encomiexpress.com',
      password: hashedPassword,
      habilitado: true,
    });
    console.log('Usuario admin creado: admin@encomiexpress.com');
  }

  await sequelize.close();
};

run().catch((err) => {
  console.error('Error al ejecutar el seed:', err.message);
  process.exit(1);
});
