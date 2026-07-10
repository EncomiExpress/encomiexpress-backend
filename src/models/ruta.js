const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ruta = sequelize.define('Ruta', {
  idRuta: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombreRuta: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  idVehiculo: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  fechaSalida: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  horaSalida: {
    type: DataTypes.TIME,
    allowNull: true
  },
  horaLlegadaEstimada: {
    type: DataTypes.TIME,
    allowNull: true
  },
  estado: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'Programada'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fechaCreacion: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'ruta',
  timestamps: false,
  underscored: true
});

module.exports = Ruta;