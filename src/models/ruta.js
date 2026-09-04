const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ruta = sequelize.define('Ruta', {
  idRuta: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  origen: {
    type: DataTypes.STRING(150),
    allowNull: true,
    defaultValue: 'Medellín'
  },
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Si está lleno, esta fila ES el viaje de regreso de esa otra Ruta (misma noción
  // de "un solo viaje con dos fases" que describió la usuaria, sin tocar el estado
  // de ninguna de las dos filas — ver LOGICA.md, "Viaje de regreso vinculado").
  idRutaIda: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  fechaSalida: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  fechaLlegadaEstimada: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  horaSalida: {
    type: DataTypes.TIME,
    allowNull: true
  },
  horaLlegadaEstimada: {
    type: DataTypes.TIME,
    allowNull: true
  },
  estado: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'Programada'
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