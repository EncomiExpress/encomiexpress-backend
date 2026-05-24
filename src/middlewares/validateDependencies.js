const { Op } = require('sequelize');
const { Ruta, EncomiendaVenta, Vehiculo, Conductor, PropietarioVehiculo, Destino, AnticipoExcedente, Cliente } = require('../models');
const AppError = require('../errors/appError');

const tieneRutasActivas = async (conductorId) => {
  const rutas = await Ruta.count({
    where: {
      idConductor: conductorId,
      habilitado: true
    }
  });
  return rutas > 0;
};

const tieneVehiculosActivos = async (conductorId) => {
  const vehiculos = await Vehiculo.count({
    where: { idConductor: conductorId, habilitado: true }
  });
  return vehiculos > 0;
};

const tieneAnticiposPendientes = async (conductorId) => {
  const anticipos = await AnticipoExcedente.count({
    where: {
      idConductor: conductorId,
      estado: { [Op.in]: ['entregado', 'en legalización', 'excedente pendiente'] }
    }
  });
  return anticipos > 0;
};

const tieneRutasActivasPorVehiculo = async (vehiculoId) => {
  const rutas = await Ruta.count({
    where: { idVehiculo: vehiculoId, habilitado: true }
  });
  return rutas > 0;
};

const tieneVehiculosActivosPorPropietario = async (propietarioId) => {
  const vehiculos = await Vehiculo.count({
    where: { idPropietario: propietarioId, habilitado: true }
  });
  return vehiculos > 0;
};

const tieneRutasActivasPorDestino = async (destinoId) => {
  const rutas = await Ruta.count({
    where: { idDestino: destinoId, habilitado: true }
  });
  return rutas > 0;
};

const tieneEncomiendasActivasPorRuta = async (rutaId) => {
  const encomiendas = await EncomiendaVenta.count({
    where: {
      idRuta: rutaId,
      estado: { [Op.notIn]: ['entregado', 'devuelto'] }
    }
  });
  return encomiendas > 0;
};

const tieneEncomiendasActivasPorCliente = async (clienteId) => {
  const encomiendas = await EncomiendaVenta.count({
    where: {
      idCliente: clienteId,
      estado: { [Op.notIn]: ['entregado', 'devuelto'] }
    }
  });
  return encomiendas > 0;
};

module.exports = {
  tieneRutasActivas,
  tieneVehiculosActivos,
  tieneAnticiposPendientes,
  tieneRutasActivasPorVehiculo,
  tieneVehiculosActivosPorPropietario,
  tieneRutasActivasPorDestino,
  tieneEncomiendasActivasPorRuta,
  tieneEncomiendasActivasPorCliente
};
