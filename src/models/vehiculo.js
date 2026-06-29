const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Vehiculo = sequelize.define('Vehiculo', {
  idVehiculo: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idPropietario: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  placa: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true
  },
  marca: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  modelo: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  color: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  tipo: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  origen: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'Propio'
  },
  capacidad: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  estado: {
    type: DataTypes.STRING(30),
    defaultValue: 'Disponible'
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  fechaRegistro: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  vencimientoSOAT: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'vencimiento_soat'
  },
  vencimientoRevisionTecnica: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  vencimientoSeguroTerceros: {
    type: DataTypes.DATEONLY,
    allowNull: false
  }
  
}, {
  tableName: 'vehiculo',
  timestamps: false,
  underscored: true
});

module.exports = Vehiculo;
