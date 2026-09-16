const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Plantilla reutilizable de corredor (origen→destino) — sin fecha, hora, estado,
// convoy ni paradas: eso vive en SalidaProgramada, una fila por cada viaje
// concreto y reservable de esta ruta.
const Ruta = sequelize.define('Ruta', {
  idRuta: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false
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
