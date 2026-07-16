const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Tabla de fila única (id siempre 1) para valores de negocio globales que un
// admin puede ajustar desde el panel sin redesplegar el backend — hoy solo
// tarifaPorKg, usada para calcular valorServicio en Ventas.
const Configuracion = sequelize.define('Configuracion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1
  },
  tarifaPorKg: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'configuracion',
  timestamps: false,
  underscored: true
});

module.exports = Configuracion;
