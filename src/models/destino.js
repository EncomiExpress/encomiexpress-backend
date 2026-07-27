const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Destino = sequelize.define('Destino', {
  idDestino: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  departamento: {
    type: DataTypes.STRING(60),
    allowNull: false
  },
  ciudad: {
    type: DataTypes.STRING(60),
    allowNull: false
  },
  // Dirección de la oficina/punto de entrega en ese destino. Opcional porque no
  // todos los destinos tienen una oficina física registrada todavía.
  direccion: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  tarifaBase: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'destino',
  timestamps: false,
  underscored: true
});

module.exports = Destino;
