const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cliente = sequelize.define('Cliente', {
  idCliente: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tipoIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  numeroIdentificacion: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  nombre: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  apellido: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Sede (operador_sede) que registró este cliente — NULL = registrado desde
  // Medellín. Antes existía además `idDestino` ("municipio de devolución del
  // remitente", elegible a mano); se eliminó por redundante — con sedes remotas
  // ese municipio siempre iba a ser el mismo que la sede que registra. Ver
  // LOGICA.md, "Decisión — Municipio de Cliente ya no es editable".
  idSede: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  habilitado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'cliente',
  timestamps: false,
  underscored: true
});

module.exports = Cliente;
