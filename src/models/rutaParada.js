const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Parada intermedia del corredor de una Ruta — además del origen (texto libre) y
// del idDestino final que ya tiene Ruta, el vehículo puede pasar por varios
// municipios dejando paquetes en cada uno (ver ../../../LOGICA.md, "Rutas con
// paradas"). Es información aditiva: Ruta.idDestino sigue siendo el destino final
// del tramo troncal, sin cambios.
const RutaParada = sequelize.define('RutaParada', {
  idRutaParada: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idRuta: {
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
  },
  // ETA de paso por esta parada — opcional, no se pide todavía en el formulario.
  // Reservado para cuando Ventas recalcule fechaEstimadaEntrega contra la parada
  // del paquete en vez de contra el destino final de la ruta completa.
  fechaLlegadaEstimada: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  horaLlegadaEstimada: {
    type: DataTypes.TIME,
    allowNull: true
  }
}, {
  tableName: 'ruta_parada',
  timestamps: false,
  underscored: true
});

module.exports = RutaParada;
