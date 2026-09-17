const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Plantilla reutilizable de corredor (origen→destino) — sin fecha, hora, estado
// ni convoy: eso vive en SalidaProgramada, una fila por cada viaje
// concreto y reservable de esta ruta.
const Ruta = sequelize.define('Ruta', {
  idRuta: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Una plantilla por corredor: el servicio ya rechaza duplicados a mano
  // (rutaService.create/update), pero `unique: true` lo respalda también a
  // nivel de base de datos -- sin esto, dos creaciones casi simultáneas podían
  // colarse entre el chequeo y el INSERT y dejar dos rutas al mismo destino.
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
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
