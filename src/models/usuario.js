const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define('Usuario', {
  idUsuario: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idRol: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  tipoIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  numeroIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  nombre: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  apellido: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'usuario',
  timestamps: false,
  underscored: true,
  // Únicos SOLO entre cuentas activas (no `unique: true` de columna, a
  // propósito) — un registro inhabilitado no debe dejar su correo/documento
  // bloqueados para siempre. Ver database/init.sql y LOGICA.md, "Usuario —
  // correo/documento únicos solo entre activos".
  indexes: [
    { unique: true, fields: ['numero_identificacion'], where: { habilitado: true }, name: 'uq_usuario_numero_identificacion_activo' },
    { unique: true, fields: ['email'], where: { habilitado: true }, name: 'uq_usuario_email_activo' },
  ],
});

module.exports = Usuario;
