const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EncomiendaVenta = sequelize.define('EncomiendaVenta', {
  idEncomiendaVenta: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idCliente: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idRuta: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  numeroGuia: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  numeroFactura: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  fechaRegistro: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW
  },
  fechaHoraEmision: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  fechaEstimadaEntrega: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  estado: {
    type: DataTypes.STRING(30),
    defaultValue: 'pendiente de recogida'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  valorServicio: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  impuestos: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  tokenSeguimiento: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  },
  metodoPago: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  estadoPago: {
    type: DataTypes.STRING(20),
    defaultValue: 'pendiente'
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'encomienda_venta',
  timestamps: false,
  underscored: true
});

module.exports = EncomiendaVenta;
