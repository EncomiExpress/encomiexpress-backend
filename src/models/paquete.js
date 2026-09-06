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
  }
}, {
  tableName: 'paquete',
  timestamps: false,
  underscored: true
});

module.exports = Paquete;
