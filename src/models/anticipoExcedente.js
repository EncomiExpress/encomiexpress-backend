const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AnticipoExcedente = sequelize.define('AnticipoExcedente', {
  idAnticipoExcedente: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'idAnticipoExcedente'
  },
  idConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idRuta: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  valorAnticipo: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  valorGastado: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  excedente: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  estado: {
    type: DataTypes.STRING(30),
    defaultValue: 'pendiente'
  },
  soporte: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fechaEntrega: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  fechaLegalizacion: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  fechaEntregaExcedente: {
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  tableName: 'anticipoExcedente',
  timestamps: false
});

module.exports = AnticipoExcedente;
