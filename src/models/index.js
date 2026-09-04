// ============================================
// Importar configuración de Sequelize
// ============================================
const sequelize = require('../config/database');

// ============================================
// Importar modelos separados
// ============================================
const Rol = require('./rol');
const Permiso = require('./permiso');
const RolPermiso = require('./rolPermiso');
const Usuario = require('./usuario');
const Conductor = require('./conductor');
const Cliente = require('./cliente');
const PropietarioVehiculo = require('./propietarioVehiculo');
const Vehiculo = require('./vehiculo');
const Destino = require('./destino');
const Ruta = require('./ruta');
const RutaVehiculoConductor = require('./rutaVehiculoConductor');
const AnticipoExcedente = require('./anticipoExcedente');
const EncomiendaVenta = require('./encomiendaVenta');
const Destinatario = require('./destinatario');
const Paquete = require('./paquete');
const Configuracion = require('./configuracion');

// ============================================
// RELACIONES
// ============================================

// Rol - Usuario (1:N)
Rol.hasMany(Usuario, { foreignKey: 'idRol', as: 'usuarios' });
Usuario.belongsTo(Rol, { foreignKey: 'idRol', as: 'rol' });

// Rol - Permiso (N:N a través de RolPermiso)
Rol.belongsToMany(Permiso, { 
  through: RolPermiso, 
  foreignKey: 'idRol', 
  otherKey: 'idPermiso',
  as: 'permisos'
});
Permiso.belongsToMany(Rol, { 
  through: RolPermiso, 
  foreignKey: 'idPermiso', 
  otherKey: 'idRol',
  as: 'roles'
});

// RolPermiso - Permiso (para poder incluir en consultas)
RolPermiso.belongsTo(Permiso, { foreignKey: 'idPermiso', as: 'permiso' });
Permiso.hasMany(RolPermiso, { foreignKey: 'idPermiso', as: 'rolesPermisos' });

// Usuario - Conductor (1:1)
Usuario.hasOne(Conductor, { foreignKey: 'idUsuario', as: 'conductor' });
Conductor.belongsTo(Usuario, { foreignKey: 'idUsuario', as: 'usuario' });

// PropietarioVehiculo - Vehiculo (1:N)
PropietarioVehiculo.hasMany(Vehiculo, { foreignKey: 'idPropietario', as: 'vehiculos' });
Vehiculo.belongsTo(PropietarioVehiculo, { foreignKey: 'idPropietario', as: 'propietario' });

// Ruta - RutaVehiculoConductor (1:N) — una ruta puede repartirse entre varios
// vehículos, cada uno con su conductor (ver comentario en la tabla, init.sql).
Ruta.hasMany(RutaVehiculoConductor, { foreignKey: 'idRuta', as: 'paresVehiculoConductor' });
RutaVehiculoConductor.belongsTo(Ruta, { foreignKey: 'idRuta', as: 'ruta' });

// Vehiculo - RutaVehiculoConductor (1:N)
Vehiculo.hasMany(RutaVehiculoConductor, { foreignKey: 'idVehiculo', as: 'asignacionesRuta' });
RutaVehiculoConductor.belongsTo(Vehiculo, { foreignKey: 'idVehiculo', as: 'vehiculo' });

// Conductor - RutaVehiculoConductor (1:N)
Conductor.hasMany(RutaVehiculoConductor, { foreignKey: 'idConductor', as: 'asignacionesRuta' });
RutaVehiculoConductor.belongsTo(Conductor, { foreignKey: 'idConductor', as: 'conductor' });

// RutaVehiculoConductor - Paquete (1:N) — cada paquete va asignado a un par
// vehículo+conductor específico de la ruta (no todos los paquetes de una venta
// van forzosamente al mismo vehículo).
RutaVehiculoConductor.hasMany(Paquete, { foreignKey: 'idRutaVehiculoConductor', as: 'paquetes' });
Paquete.belongsTo(RutaVehiculoConductor, { foreignKey: 'idRutaVehiculoConductor', as: 'asignacion' });

// Destino - Ruta (1:N)
Destino.hasMany(Ruta, { foreignKey: 'idDestino', as: 'rutas' });
Ruta.belongsTo(Destino, { foreignKey: 'idDestino', as: 'destino' });

// Conductor - AnticipoExcedente (1:N)
Conductor.hasMany(AnticipoExcedente, { foreignKey: 'idConductor', as: 'anticipos' });
AnticipoExcedente.belongsTo(Conductor, { foreignKey: 'idConductor', as: 'conductor' });

// Ruta - AnticipoExcedente (1:N)
Ruta.hasMany(AnticipoExcedente, { foreignKey: 'idRuta', as: 'anticipos' });
AnticipoExcedente.belongsTo(Ruta, { foreignKey: 'idRuta', as: 'ruta' });

// Cliente - EncomiendaVenta (1:N)
Cliente.hasMany(EncomiendaVenta, { foreignKey: 'idCliente', as: 'encomiendas' });
EncomiendaVenta.belongsTo(Cliente, { foreignKey: 'idCliente', as: 'cliente' });

// Ruta - EncomiendaVenta (1:N)
Ruta.hasMany(EncomiendaVenta, { foreignKey: 'idRuta', as: 'encomiendas' });
EncomiendaVenta.belongsTo(Ruta, { foreignKey: 'idRuta', as: 'ruta' });

// EncomiendaVenta - Destinatario (1:1)
EncomiendaVenta.hasOne(Destinatario, { foreignKey: 'idEncomiendaVenta', as: 'destinatario' });
Destinatario.belongsTo(EncomiendaVenta, { foreignKey: 'idEncomiendaVenta', as: 'encomienda' });

// Destino - Destinatario (1:N) — a qué municipio se envía el paquete (decisión
// comercial, capturada en Ventas), distinto del idDestino de la Ruta que después
// se le asigne administrativamente.
Destino.hasMany(Destinatario, { foreignKey: 'idDestino', as: 'destinatarios' });
Destinatario.belongsTo(Destino, { foreignKey: 'idDestino', as: 'destino' });

// EncomiendaVenta - Paquete (1:N)
EncomiendaVenta.hasMany(Paquete, { foreignKey: 'idEncomiendaVenta', as: 'paquetes' });
Paquete.belongsTo(EncomiendaVenta, { foreignKey: 'idEncomiendaVenta', as: 'encomienda' });

// ============================================
// EXPORTS
// ============================================
module.exports = {
  sequelize,
  Rol,
  Permiso,
  RolPermiso,
  Usuario,
  Conductor,
  Cliente,
  PropietarioVehiculo,
  Vehiculo,
  Destino,
  Ruta,
  RutaVehiculoConductor,
  AnticipoExcedente,
  EncomiendaVenta,
  Destinatario,
  Paquete,
  Configuracion
};
