const { Rol, Permiso, RolPermiso } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'idRol', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idRol';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ habilitado, q, page = 1, limit = 50, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (q) {
    const query = `%${q.trim()}%`;
    where[Op.or] = [
      { nombre: { [Op.iLike]: query } },
      { descripcion: { [Op.iLike]: query } },
    ];
  }
  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);
  const { count, rows } = await Rol.findAndCountAll({
    where,
    include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }],
    limit: Number(limit),
    offset,
    order: order.length > 0 ? order : [['idRol', 'ASC']],
    distinct: true,
  });
  const data = rows.map(rol => ({
    ...rol.toJSON(),
    permisos: rol.permisos.map(p => p.nombre),
    permisosIds: rol.permisos.map(p => p.idPermiso)
  }));
  return { data, total: count };
};

const getById = async (id) => {
  const rol = await Rol.findByPk(id, {
    include: [
      {
        model: Permiso,
        as: 'permisos',
        through: { attributes: [] }
      }
    ]
  });

  if (!rol) {
    throw new AppError('Rol no encontrado', 404);
  }

  return {
    ...rol.toJSON(),
    permisos: rol.permisos.map(p => p.nombre),
    permisosIds: rol.permisos.map(p => p.idPermiso)
  };
};

const create = async (data) => {
  const { nombre, descripcion, permisos } = data;

  const existingRol = await Rol.findOne({ where: { nombre } });
  if (existingRol) {
    throw new AppError('Ya existe un rol con ese nombre', 400);
  }

  const rol = await Rol.create({
    nombre,
    descripcion,
    habilitado: true
  });

  if (permisos && Array.isArray(permisos)) {
    const rolPermisos = permisos.map(idPermiso => ({
      idRol: rol.idRol,
      idPermiso
    }));
    await RolPermiso.bulkCreate(rolPermisos);
  }

  const rolCreado = await Rol.findByPk(rol.idRol, {
    include: [
      {
        model: Permiso,
        as: 'permisos',
        through: { attributes: [] }
      }
    ]
  });

  return {
    ...rolCreado.toJSON(),
    permisos: rolCreado.permisos.map(p => p.nombre),
    permisosIds: rolCreado.permisos.map(p => p.idPermiso)
  };
};

const update = async (id, data) => {
  const { nombre, descripcion, habilitado, permisos } = data;

  const rol = await Rol.findByPk(id);
  if (!rol) {
    throw new AppError('Rol no encontrado', 404);
  }

  if (nombre && nombre !== rol.nombre) {
    const existingRol = await Rol.findOne({ where: { nombre } });
    if (existingRol) {
      throw new AppError('Ya existe un rol con ese nombre', 400);
    }
  }

  await rol.update({
    nombre: nombre || rol.nombre,
    descripcion: descripcion || rol.descripcion,
    habilitado: habilitado !== undefined ? habilitado : rol.habilitado
  });

  if (permisos && Array.isArray(permisos)) {
    await RolPermiso.destroy({ where: { idRol: id } });

    const rolPermisos = permisos.map(idPermiso => ({
      idRol: id,
      idPermiso
    }));
    await RolPermiso.bulkCreate(rolPermisos);
  }

  const rolActualizado = await Rol.findByPk(id, {
    include: [
      {
        model: Permiso,
        as: 'permisos',
        through: { attributes: [] }
      }
    ]
  });

  return {
    ...rolActualizado.toJSON(),
    permisos: rolActualizado.permisos.map(p => p.nombre),
    permisosIds: rolActualizado.permisos.map(p => p.idPermiso)
  };
};

const toggleHabilitado = async (id) => {
  const rol = await Rol.findByPk(id, {
    include: [
      {
        model: Permiso,
        as: 'permisos',
        through: { attributes: [] }
      }
    ]
  });
  if (!rol) {
    throw new AppError('Rol no encontrado', 404);
  }

  await rol.update({ habilitado: !rol.habilitado });
  await rol.reload();

  return {
    ...rol.toJSON(),
    permisos: rol.permisos.map(p => p.nombre),
    permisosIds: rol.permisos.map(p => p.idPermiso)
  };
};

const getAllPermisos = async () => {
  const permisos = await Permiso.findAll({
    order: [['idPermiso', 'ASC']]
  });
  return permisos;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado,
  getAllPermisos
};