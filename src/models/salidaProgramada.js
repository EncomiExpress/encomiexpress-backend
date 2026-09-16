const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// La agenda: cada fila es una instancia concreta y reservable de una Ruta
// (fecha/hora/estado/convoy/paradas propios). Absorbe todo lo que antes vivía
// en Ruta (fechaSalida, horaSalida, estado, etc.) — ver LOGICA.md, "Viaje de
// regreso vinculado" (el vínculo ida/vuelta vive aquí, no en la plantilla,
// porque casi toda la lógica de negocio necesita el estado/fecha del otro
// tramo junto con el vínculo).
const SalidaProgramada = sequelize.define('SalidaProgramada', {
  idSalida: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idRuta: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Si está lleno, esta fila ES el viaje de regreso de esa otra SalidaProgramada
  // (misma noción de "un solo viaje con dos fases" — ver LOGICA.md, "Viaje de
  // regreso vinculado").
  idSalidaIda: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  origen: {
    type: DataTypes.STRING(150),
    allowNull: true,
    defaultValue: 'Medellín'
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
  tableName: 'salida_programada',
  timestamps: false,
  underscored: true
});

module.exports = SalidaProgramada;
