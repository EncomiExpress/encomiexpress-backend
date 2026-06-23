const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Permiso = sequelize.define('Permiso', {
  idPermiso: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'permiso',
  timestamps: false,
  underscored: true
});

module.exports = Permiso;
