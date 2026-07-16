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
  const field = allowedFields[parts[0]] || 'idCliente';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idCliente') return [[field, direction]];
  return [[field, direction], ['idCliente', direction]];
};

const getAll = async ({ habilitado, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (q) {
    const trimmed = q.trim();
    const query = `%${trimmed}%`;
    const numericId = Number(q);
    const conditions = [
      { nombre: { [Op.iLike]: query } },
      { apellido: { [Op.iLike]: query } },
      { email: { [Op.iLike]: query } },
      { telefono: { [Op.iLike]: query } },
      { direccion: { [Op.iLike]: query } },
      { tipoIdentificacion: { [Op.iLike]: query } },
      { numeroIdentificacion: { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idCliente: numericId });
    }
    // "Maria Garcia" no coincide con nombre NI apellido por separado — se
    // prueban las dos combinaciones para que el nombre completo también
    // encuentre resultado.
    const partes = trimmed.split(/\s+/).filter(Boolean);
    if (partes.length > 1) {
      const primero = `%${partes[0]}%`;
      const resto = `%${partes.slice(1).join(' ')}%`;
      conditions.push({ [Op.and]: [{ nombre: { [Op.iLike]: primero } }, { apellido: { [Op.iLike]: resto } }] });
      conditions.push({ [Op.and]: [{ apellido: { [Op.iLike]: primero } }, { nombre: { [Op.iLike]: resto } }] });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);
  const { count, rows: data } = await Cliente.findAndCountAll({
    where,
    limit,
    offset,
    order: order.length > 0 ? order : [['idCliente', 'DESC']],
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

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await Cliente.findByPk(id, { attributes: ['idCliente', 'nombre', 'apellido'] });
  if (!record) throw new AppError('Cliente no encontrado', 404);
  const before = await Cliente.count({
    where: {
      [Op.or]: [
        { nombre: { [Op.lt]: record.nombre } },
        { nombre: record.nombre, apellido: { [Op.lt]: record.apellido } },
        { nombre: record.nombre, apellido: record.apellido, idCliente: { [Op.lt]: parseInt(id) } },
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