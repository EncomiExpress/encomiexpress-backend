const { Destino } = require('../models');
const AppError = require('../errors/appError');
const { verificarDependenciasDestino } = require('../middlewares/validateDependencies');
const { Op } = require('sequelize');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['ciudad', 'departamento', 'idDestino', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idDestino';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idDestino') return [[field, direction]];
  return [[field, direction], ['idDestino', direction]];
};

const getAll = async ({ habilitado, departamento, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (departamento) where.departamento = departamento;
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
    order: order.length > 0 ? order : [['idDestino', 'DESC']],
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
  const { departamento, ciudad, direccion, tarifaBase } = data;

  const existente = await Destino.findOne({
    where: {
      departamento: { [Op.iLike]: departamento },
      ciudad: { [Op.iLike]: ciudad },
    },
  });
  if (existente) {
    throw new AppError('Ya existe un destino registrado con ese departamento y ciudad', 400);
  }

  const destino = await Destino.create({
    departamento,
    ciudad,
    direccion: direccion || null,
    tarifaBase: tarifaBase || 0
  });

  return destino;
};

const update = async (id, data) => {
  const { departamento, ciudad, direccion, tarifaBase, habilitado } = data;

  const destino = await Destino.findByPk(id);

  if (!destino) {
    throw new AppError('Destino no encontrado', 404);
  }

  const nuevoDepartamento = departamento || destino.departamento;
  const nuevaCiudad = ciudad || destino.ciudad;
  if (nuevoDepartamento !== destino.departamento || nuevaCiudad !== destino.ciudad) {
    const existente = await Destino.findOne({
      where: {
        departamento: { [Op.iLike]: nuevoDepartamento },
        ciudad: { [Op.iLike]: nuevaCiudad },
        idDestino: { [Op.ne]: id },
      },
    });
    if (existente) {
      throw new AppError('Ya existe un destino registrado con ese departamento y ciudad', 400);
    }
  }

  await destino.update({
    departamento: departamento || destino.departamento,
    ciudad: ciudad || destino.ciudad,
    direccion: direccion !== undefined ? direccion : destino.direccion,
    tarifaBase: tarifaBase !== undefined ? tarifaBase : destino.tarifaBase,
    habilitado: habilitado !== undefined ? habilitado : destino.habilitado
  });

  return destino;
};


const toggleHabilitado = async (id) => {
  const destino = await Destino.findByPk(id);
  if (!destino) throw new AppError('Destino no encontrado', 404);
  if (destino.habilitado === true) {
    const { bloqueado, dependencias } = await verificarDependenciasDestino(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar este destino porque tiene rutas activas o programadas',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }
  destino.habilitado = !destino.habilitado;
  await destino.save();
  return destino;
};

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await Destino.findByPk(id, { attributes: ['idDestino', 'ciudad'] });
  if (!record) throw new AppError('Destino no encontrado', 404);
  const before = await Destino.count({
    where: {
      [Op.or]: [
        { ciudad: { [Op.lt]: record.ciudad } },
        { ciudad: record.ciudad, idDestino: { [Op.lt]: parseInt(id) } },
      ],
    },
  });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado,
  getPageOf,
};