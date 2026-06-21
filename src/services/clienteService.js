const { Cliente } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasCliente } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowedFields = {
    idCliente: 'idCliente',
    nombre: 'nombre',
    apellido: 'apellido',
    tipoIdentificacion: 'tipoIdentificacion',
    numeroIdentificacion: 'numeroIdentificacion',
    habilitado: 'habilitado',
  };
  const parts = sortBy.split('.');
  const field = allowedFields[parts[0]] || 'nombre';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ habilitado, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (q) {
    const query = `%${q.trim()}%`;
    const numericId = Number(q);
    const conditions = [
      { nombre: { [Op.iLike]: query } },
      { apellido: { [Op.iLike]: query } },
      { email: { [Op.iLike]: query } },
      { direccion: { [Op.iLike]: query } },
      { tipoIdentificacion: { [Op.iLike]: query } },
      { numeroIdentificacion: { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idCliente: numericId });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);
  const { count, rows: data } = await Cliente.findAndCountAll({
    where,
    limit,
    offset,
    order: order.length > 0 ? order : [['nombre', 'ASC']],
    distinct: true,
  });
  return { data, total: count };
};

const getById = async (id) => {
  const cliente = await Cliente.findByPk(id);

  if (!cliente) {
    throw new AppError('Cliente no encontrado', 404);
  }

  return cliente;
};

const create = async (data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, direccion } = data;

  const existingCliente = await Cliente.findOne({ where: { numeroIdentificacion } });
  if (existingCliente) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  if (email) {
    const existingEmail = await Cliente.findOne({ where: { email } });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  const nuevoCliente = await Cliente.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    direccion,
    habilitado: true
  });

  return nuevoCliente;
};

const update = async (id, data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, direccion } = data;

  const cliente = await Cliente.findByPk(id);
  if (!cliente) {
    throw new AppError('Cliente no encontrado', 404);
  }

  if (numeroIdentificacion && numeroIdentificacion !== cliente.numeroIdentificacion) {
    const existingCliente = await Cliente.findOne({
      where: { numeroIdentificacion, idCliente: { [Op.ne]: id } }
    });
    if (existingCliente) {
      throw new AppError('El número de identificación ya está registrado', 400);
    }
  }

  if (email && email !== cliente.email) {
    const existingEmail = await Cliente.findOne({
      where: { email, idCliente: { [Op.ne]: id } }
    });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  await cliente.update({
    tipoIdentificacion: tipoIdentificacion || cliente.tipoIdentificacion,
    numeroIdentificacion: numeroIdentificacion || cliente.numeroIdentificacion,
    nombre: nombre || cliente.nombre,
    apellido: apellido || cliente.apellido,
    telefono: telefono || cliente.telefono,
    email: email || cliente.email,
    direccion: direccion || cliente.direccion
  });

  return cliente;
};

const toggleHabilitado = async (id) => {
  const cliente = await Cliente.findByPk(id);
  if (!cliente) throw new AppError('Cliente no encontrado', 404);

  if (cliente.habilitado === true) {
    const { bloqueado, dependencias } = await verificarDependenciasCliente(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar este cliente porque tiene encomiendas activas',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  cliente.habilitado = !cliente.habilitado;
  await cliente.save();
  return cliente;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado
};