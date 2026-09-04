const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Registro de qué conductor ha hecho de repartidor local (entrega puerta a puerta)
// en qué municipio — a diferencia de RutaVehiculoConductor (tramo troncal entre
// ciudades), esto no depende de una Ruta ni de un vehículo. Se puebla solo: cuando
// un admin asigna por primera vez a un conductor como repartidor local de un
// paquete en un municipio (encomiendaService.asignarRepartidorLocal), se crea (o
// reactiva) la fila correspondiente aquí — no hace falta una pantalla aparte para
// registrar coberturas de antemano.
const ConductorSede = sequelize.define('ConductorSede', {
  idConductorSede: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'conductor_sede',
  timestamps: false,
  underscored: true
});

module.exports = ConductorSede;
