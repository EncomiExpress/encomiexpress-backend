const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Destinatario = sequelize.define('Destinatario', {
  idDestinatario: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idEncomiendaVenta: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  // Municipio al que se envía el paquete (mismo catálogo `destino` que usa Ruta) —
  // decisión comercial capturada al vender, distinta de qué Ruta administrativa
  // termine asignándose. allowNull:true a nivel de columna por flexibilidad (igual
  // que ruta.fechaLlegadaEstimada); obligatorio en el flujo real vía encomiendasValidator.
  idDestino: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  nombreDestinatario: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  // Documento del destinatario — mismos tipos y validación que Cliente
  // (CC/NIT/TI/CE/PAS/RC). allowNull:true a nivel de columna por flexibilidad
  // (mismo criterio que el resto de campos de Destinatario); obligatorio en el
  // flujo real vía encomiendasValidator.
  tipoIdentificacionDestinatario: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  numeroIdentificacionDestinatario: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  telefonoDestinatario: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  correoDestinatario: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  direccionDestinatario: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'destinatario',
  timestamps: false,
  underscored: true
});

module.exports = Destinatario;
