const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Parada intermedia del corredor de un PAR vehículo+conductor (SalidaVehiculoConductor)
// — además del origen (texto libre) y del idDestino final que hereda de la Ruta de
// su salida (compartido por todo el convoy), CADA par puede pasar por varios
// municipios propios dejando paquetes en cada uno. Es información aditiva y por
// PAR (no por salida completa): dos pares de la misma salida pueden tener
// recorridos distintos (ej. ruta fraccionada — uno pasa por una parada intermedia,
// otro va directo al destino final).
const SalidaParada = sequelize.define('SalidaParada', {
  idSalidaParada: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idSalidaVehiculoConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Posición de esta parada en el corredor (1, 2, 3...) — el orden en que el
  // convoy las visita, no tiene relación con el id ni con el orden de creación.
  orden: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'salida_parada',
  timestamps: false,
  underscored: true
});

module.exports = SalidaParada;
