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
  // Municipio del remitente — mismo catálogo `destino` que usa Destinatario/Ruta.
  // allowNull:true a nivel de columna por flexibilidad (mismo criterio que
  // destinatario.id_destino); obligatorio en el flujo real vía clientesValidator.
  // Hace falta para saber a qué municipio devolver un paquete si el destinatario
  // pasa un mes sin recogerlo (ver LOGICA.md).
  idDestino: {
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
