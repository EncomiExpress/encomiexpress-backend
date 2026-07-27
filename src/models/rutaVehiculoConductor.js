const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RutaVehiculoConductor = sequelize.define('RutaVehiculoConductor', {
  idRutaVehiculoConductor: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idRuta: {
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
  tableName: 'ruta_vehiculo_conductor',
  timestamps: false,
  underscored: true
});

module.exports = RutaVehiculoConductor;
