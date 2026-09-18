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
  idSalidaVehiculoConductor: {
    type: DataTypes.INTEGER,
    allowNull: false
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
  // Pendiente | Pagado — recaudo de ESTE paquete. Pago Inmediato: nace Pagado.
  // Contraentrega: nace Pendiente, pasa a Pagado si el distribuidor lo marca
  // Entregado; se queda Pendiente si lo marca Devuelto (cerrado sin cobro). Ver
  // paqueteStateUtils.determinarEstadoPago y LOGICA.md, "Recaudo por paquete".
  estadoPago: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'Pendiente'
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
  // al destinatario desde "En sede de destino". Ver LOGICA.md, "Entrega en dos fases".
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
  },
  // Conductor que confirmó "Llegó a Medellín" desde la app móvil (ruta de
  // regreso). NULL cuando la devolución la registra el admin desde el panel web
  // en vez de un conductor — ver encomiendaService.registrarDevolucionPaquete y
  // plan-ventas-regreso-paquetes.md, Parte B.
  idConductorDevolucion: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  fechaDevolucion: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Póliza de seguro opcional (1% del valor declarado), por paquete individual —
  // ver encomiendaService.resolverPoliza. NULL en ambos cuando no se contrata.
  valorDeclarado: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  valorPoliza: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  // Parte del total de la venta que le toca a ESTE paquete -- lo que el
  // distribuidor cobra al entregarlo en Contraentrega. Los de una venta suman su
  // total. Se calcula al registrar/editar la venta (utils/repartoTotal.js); NULL en
  // ventas anteriores a la migración 007 (el móvil cae al total de la venta).
  valorCobro: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  }
}, {
  tableName: 'paquete',
  timestamps: false,
  underscored: true
});

module.exports = Paquete;
