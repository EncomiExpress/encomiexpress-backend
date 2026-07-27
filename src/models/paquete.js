const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Paquete = sequelize.define('Paquete', {
  idPaquete: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idEncomiendaVenta: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idRutaVehiculoConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  numeroGuia: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  descripcionContenido: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  peso: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  alto: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  ancho: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  profundidad: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true
  },
  valorDeclarado: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  }
}, {
  tableName: 'paquete',
  timestamps: false,
  underscored: true
});

module.exports = Paquete;
