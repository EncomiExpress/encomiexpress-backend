const { PropietarioVehiculo, Vehiculo } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasPropietario } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'apellido', 'idPropietario', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idPropietario';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ habilitado, q, tipoFlota, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (tipoFlota) where.tipoFlota = tipoFlota;
  if (q) {
    const query = `%${q.trim()}%`;
    const numericId = Number(q);
    const conditions = [
      { nombre: { [Op.iLike]: query } },
      { apellido: { [Op.iLike]: query } },
      { numeroIdentificacion: { [Op.iLike]: query } },
      { email: { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idPropietario: numericId });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await PropietarioVehiculo.findAndCountAll({
    where,
    limit,
    offset,
    order: order.length > 0 ? order : [['idPropietario', 'ASC']],
    distinct: true,
  });

  return { data, total: count };
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

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await PropietarioVehiculo.findByPk(id, { attributes: ['idPropietario'] });
  if (!record) throw new AppError('Propietario no encontrado', 404);
  const before = await PropietarioVehiculo.count({
    where: { idPropietario: { [Op.lt]: parseInt(id) } },
  });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

const toggleHabilitado = async (id) => {
  const propietario = await PropietarioVehiculo.findByPk(id);
  if (!propietario) throw new AppError('Propietario no encontrado', 404);
  if (propietario.habilitado === true) {
    const { bloqueado, dependencias } = await verificarDependenciasPropietario(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar este propietario porque tiene vehículos activos asociados',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
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
  toggleHabilitado,
  getPageOf,
};