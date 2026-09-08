const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Sedes (municipios) que cubre un usuario con rol 'distribuidor' — la persona de
// la sede que hace la entrega final al destinatario, después de que el conductor
// del tramo troncal dejó el paquete "En sede de destino". Estas filas se
// registran a mano desde el módulo Usuarios de la web al crear/editar un
// distribuidor. Un distribuidor puede cubrir varias sedes.
const UsuarioSede = sequelize.define('UsuarioSede', {
  idUsuarioSede: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idUsuario: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'usuario_sede',
  timestamps: false,
  underscored: true
});

module.exports = UsuarioSede;
