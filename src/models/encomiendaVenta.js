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
    defaultValue: 'Programada'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  total: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  metodoPago: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  estadoPago: {
    type: DataTypes.STRING(20),
    defaultValue: 'Pendiente'
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
