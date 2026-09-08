const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Historial completo de la entrega final de un paquete (ver ../../../LOGICA.md,
// "Historial de entrega final") -- una fila por CADA llamada a
// encomiendaService.registrarEntregaFinal (Entregado, Devuelto y también los
// intentos fallidos), con su propia novedad/foto/fecha. Antes esa evidencia vivía
// solo en Paquete.observacionEstado/fotoEntrega -- un único par de campos
// compartido que cada llamada sobrescribía, así que el detalle de cada intento
// se perdía apenas se registraba la siguiente acción. Esta tabla es puramente
// aditiva (append-only, nunca se actualiza ni se borra una fila) -- Paquete
// sigue teniendo su propio observacionEstado/fotoEntrega para acceso rápido al
// estado más reciente sin tener que unir con esta tabla.
const PaqueteEntregaFinal = sequelize.define('PaqueteEntregaFinal', {
  idPaqueteEntregaFinal: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  idPaquete: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // 'Entregado' | 'Devuelto' | 'Intento' -- mismo valor que ACCIONES_ENTREGA_FINAL
  // en encomiendaService.js.
  accion: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  novedad: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  foto: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  idUsuarioDistribuidor: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  fecha: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'paquete_entrega_final',
  timestamps: false,
  underscored: true
});

module.exports = PaqueteEntregaFinal;
