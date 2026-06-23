const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PropietarioVehiculo = sequelize.define('PropietarioVehiculo', {
  idPropietario: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tipoIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  numeroIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
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
    allowNull: true
  },
  tarjetaPropiedad: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  tipoFlota: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'propietario_vehiculo',
  timestamps: false,
  underscored: true
});

module.exports = PropietarioVehiculo;
