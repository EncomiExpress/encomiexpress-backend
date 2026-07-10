const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RolPermiso = sequelize.define('RolPermiso', {

  idRol: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true
  },

  idPermiso: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true
  }

}, {
  tableName: 'rol_permiso',
  timestamps: false,
  underscored: true
});

module.exports = RolPermiso;