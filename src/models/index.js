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
const AnticipoExcedente = require('./anticipoExcedente');
const EncomiendaVenta = require('./encomiendaVenta');
const Destinatario = require('./destinatario');
const Paquete = require('./paquete');

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

// Vehiculo - Ruta (1:N)
Vehiculo.hasMany(Ruta, { foreignKey: 'idVehiculo', as: 'rutas' });
Ruta.belongsTo(Vehiculo, { foreignKey: 'idVehiculo', as: 'vehiculo' });

// Conductor - Ruta (1:N)
Conductor.hasMany(Ruta, { foreignKey: 'idConductor', as: 'rutas' });
Ruta.belongsTo(Conductor, { foreignKey: 'idConductor', as: 'conductor' });

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

// EncomiendaVenta - Destinatario (1:N)
EncomiendaVenta.hasMany(Destinatario, { foreignKey: 'idEncomiendaVenta', as: 'destinatarios' });
Destinatario.belongsTo(EncomiendaVenta, { foreignKey: 'idEncomiendaVenta', as: 'encomienda' });

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
  AnticipoExcedente,
  EncomiendaVenta,
  Destinatario,
  Paquete
};
