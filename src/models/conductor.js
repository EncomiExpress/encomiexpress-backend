const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conductor = sequelize.define('Conductor', {
  idConductor: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idUsuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  categoriasLicencia: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  numeroLicencia: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  estado: {
    type: DataTypes.STRING(30),
    defaultValue: 'Disponible'
  },
  // Municipio donde quedó el conductor tras completar/cancelar una ruta cuyo
  // destino no es la base (Medellín). NULL = en base. Bloquea asignarlo a una
  // ruta nueva desde Medellín hasta que se programe su viaje de regreso.
  idDestinoActual: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'conductor',
  timestamps: false,
  underscored: true
});

module.exports = Conductor;