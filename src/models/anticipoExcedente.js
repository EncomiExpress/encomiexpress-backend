const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AnticipoExcedente = sequelize.define('AnticipoExcedente', {
  idAnticipoExcedente: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idRuta: {
    type: DataTypes.INTEGER,
    allowNull: false
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
    defaultValue: 'Entregado'
  },
  // Array de URLs de Cloudinary — un anticipo puede tener varios comprobantes
  // (mismo patrón que Conductor.categoriasLicencia).
  soporte: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
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
  tableName: 'anticipo_excedente',
  timestamps: false,
  underscored: true
});

module.exports = AnticipoExcedente;
