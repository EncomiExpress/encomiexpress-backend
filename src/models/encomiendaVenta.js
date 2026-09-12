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
  modalidadRecaudo: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  // Rollup derivado, calculado por paqueteStateUtils.determinarEstadoPago a
  // partir de paquete.estadoPago — nadie lo escribe a mano desde afuera. Ver
  // LOGICA.md, "Recaudo por paquete".
  estadoPago: {
    type: DataTypes.STRING(20),
    defaultValue: 'Pendiente'
  },
  // Sede (operador_sede) que registró esta venta — NULL = registrada desde
  // Medellín. Alimenta el filtro "solo lo mío" de Ventas. Ver LOGICA.md,
  // "Sedes remotas".
  idSede: {
    type: DataTypes.INTEGER,
    allowNull: true
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
