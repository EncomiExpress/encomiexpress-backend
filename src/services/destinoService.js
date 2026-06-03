const { Destino, Ruta } = require('../models');
const AppError = require('../errors/appError');
const { tieneRutasActivasPorDestino } = require('../middlewares/validateDependencies');
const { Op } = require('sequelize');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['ciudad', 'departamento', 'idDestino', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idDestino';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ habilitado, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (q) {
    const query = `%${q.trim()}%`;
    where[Op.or] = [
      { ciudad: { [Op.iLike]: query } },
      { departamento: { [Op.iLike]: query } },
    ];
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Destino.findAndCountAll({
    where,
    limit,
    offset,
    order: order.length > 0 ? order : [['idDestino', 'ASC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const destino = await Destino.findByPk(id);

  if (!destino) {
    throw new AppError('Destino no encontrado', 404);
  }

  return destino;
};

const create = async (data) => {
  const { departamento, ciudad, tarifaBase } = data;

  const destino = await Destino.create({
    departamento,
    ciudad,
    tarifaBase: tarifaBase || 0
  });

  return destino;
};

const update = async (id, data) => {
  const { departamento, ciudad, tarifaBase, habilitado } = data;

  const destino = await Destino.findByPk(id);

  if (!destino) {
    throw new AppError('Destino no encontrado', 404);
  }

  await destino.update({
    departamento: departamento || destino.departamento,
    ciudad: ciudad || destino.ciudad,
    tarifaBase: tarifaBase !== undefined ? tarifaBase : destino.tarifaBase,
    habilitado: habilitado !== undefined ? habilitado : destino.habilitado
  });

  return destino;
};


const getRutas = async (id) => {
  const destino = await Destino.findByPk(id);
  if (!destino) {
    throw new AppError('Destino no encontrado', 404);
  }

  const rutas = await Ruta.findAll({
    where: { idDestino: id }
  });

  return rutas;
};

const toggleHabilitado = async (id) => {
  const destino = await Destino.findByPk(id);
  if (!destino) throw new AppError('Destino no encontrado', 404);
  if (destino.habilitado === true) {
    const rutasActivas = await tieneRutasActivasPorDestino(id);
    if (rutasActivas) throw new AppError('No se puede inhabilitar un destino con rutas activas', 400);
  }
  destino.habilitado = !destino.habilitado;
  await destino.save();
  return destino;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  getRutas
  , toggleHabilitado
};