const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conductor = sequelize.define('Conductor', {
  idConductor: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idUsuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  categoriaLicencia: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  numeroLicencia: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  vencimientoLicencia: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  estado: {
    type: DataTypes.STRING(30),
    defaultValue: 'Disponible'
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'conductor',
  timestamps: false,
  underscored: true
});

module.exports = Conductor;