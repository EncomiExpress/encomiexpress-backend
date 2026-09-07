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
  // Repartidor local que hace la entrega puerta a puerta en el municipio de
  // destino, DESPUÉS de que el paquete se marcó "En sede de destino" — distinto
  // del conductor de idRutaVehiculoConductor, que solo hizo el tramo troncal.
  // Nulo mientras el paquete no llega a una sede o no se le ha asignado nadie
  // todavía. Ver encomiendaService.asignarRepartidorLocal.
  idConductorEntrega: {
    type: DataTypes.INTEGER,
    allowNull: true
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
  // hierro | normal — determina qué tarifa por kg (Configuracion.tarifaPorKgHierro/
  // tarifaPorKgNormal) aplica en el cálculo de total de la venta.
  tipoCarga: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'normal',
    validate: { isIn: [['hierro', 'normal']] }
  },
  estado: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'Por entregar'
  },
  observacionEstado: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fechaUltimoEstado: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fotoEntrega: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Usuario con rol 'distribuidor' (persona de la sede) que hizo la entrega final
  // al destinatario desde "En sede de destino" — distinto de idConductorEntrega
  // (repartidor local que sí es un conductor). Ver LOGICA.md, "Entrega en dos fases".
  idUsuarioEntrega: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  // "Insistidera": nº de intentos fallidos del distribuidor de entregar al
  // destinatario (el paquete sigue "En sede de destino"). No cuenta la entrega
  // exitosa ni la marca final de no-entregado ("Devuelto").
  intentosEntrega: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  fechaUltimoIntento: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'paquete',
  timestamps: false,
  underscored: true
});

module.exports = Paquete;
