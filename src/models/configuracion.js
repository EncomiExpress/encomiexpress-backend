const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Tabla de fila única (id siempre 1) para valores de negocio globales que un
// admin puede ajustar desde el panel sin redesplegar el backend — usadas para
// calcular valorServicio en Ventas (tarifaBase del destino + costo por peso de
// cada paquete, según su tipoCarga, + cantidad de paquetes × tarifaPorPaquete).
const Configuracion = sequelize.define('Configuracion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1
  },
  // Tarifa por kg para paquetes de carga "hierro" (metal pesado).
  tarifaPorKgHierro: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 450
  },
  // Tarifa por kg para paquetes de carga "normal" (ropa, cosméticos, etc.).
  tarifaPorKgNormal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 650
  },
  // Tarifa base fija por cada paquete de la venta (independiente del peso).
  tarifaPorPaquete: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 10000
  }
}, {
  tableName: 'configuracion',
  timestamps: false,
  underscored: true
});

module.exports = Configuracion;
