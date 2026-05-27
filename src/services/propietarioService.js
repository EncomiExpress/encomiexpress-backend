const { PropietarioVehiculo, Vehiculo } = require('../models');
const AppError = require('../errors/appError');
const { tieneVehiculosActivosPorPropietario } = require('../middlewares/validateDependencies');

const getAll = async ({ habilitado }) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';

  const propietarios = await PropietarioVehiculo.findAll({ where });
  return propietarios;
};

const getById = async (id) => {
  const propietario = await PropietarioVehiculo.findByPk(id);

  if (!propietario) {
    throw new AppError('Propietario no encontrado', 404);
  }

  return propietario;
};

const create = async (data) => {
  const {
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    tarjetaPropiedad,
    tipoFlota
  } = data;

  const propietario = await PropietarioVehiculo.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    tarjetaPropiedad,
    tipoFlota
  });

  return propietario;
};

const update = async (id, data) => {
  const {
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    tarjetaPropiedad,
    tipoFlota,
    habilitado
  } = data;

  const propietario = await PropietarioVehiculo.findByPk(id);

  if (!propietario) {
    throw new AppError('Propietario no encontrado', 404);
  }

  await propietario.update({
    tipoIdentificacion: tipoIdentificacion || propietario.tipoIdentificacion,
    numeroIdentificacion: numeroIdentificacion || propietario.numeroIdentificacion,
    nombre: nombre || propietario.nombre,
    apellido: apellido || propietario.apellido,
    telefono: telefono !== undefined ? telefono : propietario.telefono,
    email: email !== undefined ? email : propietario.email,
    tarjetaPropiedad: tarjetaPropiedad !== undefined ? tarjetaPropiedad : propietario.tarjetaPropiedad,
    tipoFlota: tipoFlota !== undefined ? tipoFlota : propietario.tipoFlota,
    habilitado: habilitado !== undefined ? habilitado : propietario.habilitado
  });

  return propietario;
};


const getVehiculos = async (id) => {
  const propietario = await PropietarioVehiculo.findByPk(id);
  if (!propietario) {
    throw new AppError('Propietario no encontrado', 404);
  }

  const vehiculos = await Vehiculo.findAll({
    where: { idPropietario: id }
  });

  return vehiculos;
};

const toggleHabilitado = async (id) => {
  const propietario = await PropietarioVehiculo.findByPk(id);
  if (!propietario) throw new AppError('Propietario no encontrado', 404);
  if (propietario.habilitado === true) {
    const vehiculosActivos = await tieneVehiculosActivosPorPropietario(id);
    if (vehiculosActivos) throw new AppError('No se puede inhabilitar un propietario con vehículos activos', 400);
  }
  propietario.habilitado = !propietario.habilitado;
  await propietario.save();
  return propietario;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  getVehiculos,
  toggleHabilitado
};