const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Destinatario = sequelize.define('Destinatario', {
  idDestinatario: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idEncomiendaVenta: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  nombreDestinatario: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  telefonoDestinatario: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  direccionDestinatario: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'destinatario',
  timestamps: false,
  underscored: true
});

module.exports = Destinatario;
