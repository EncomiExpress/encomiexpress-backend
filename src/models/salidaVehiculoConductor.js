const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SalidaVehiculoConductor = sequelize.define('SalidaVehiculoConductor', {
  idSalidaVehiculoConductor: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idSalida: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idVehiculo: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'salida_vehiculo_conductor',
  timestamps: false,
  underscored: true
});

module.exports = SalidaVehiculoConductor;
