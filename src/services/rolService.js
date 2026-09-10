const { Rol, Permiso, RolPermiso, Usuario } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'idRol', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idRol';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idRol') return [[field, direction]];
  return [[field, direction], ['idRol', direction]];
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
    order: order.length > 0 ? order : [['idRol', 'DESC']],
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

  // El nombre y la descripción del rol admin (id=1) sí se pueden editar
  // libremente ahora — el bug real de "Admin" con mayúscula (login por rol
  // comparando contra el string exacto 'admin' en middlewares/auth.js)
  // quedó resuelto de raíz: esa comparación usa Rol.codigo, un identificador
  // estable que nunca se toca desde aquí (no se lee `data.codigo`), así que
  // `nombre` es puro texto de display para cualquier rol, admin incluido.
  // Los permisos y el estado del rol admin siguen intocables: vaciarle los
  // permisos o inhabilitarlo dejaría el sistema sin ningún admin funcional.
  // El formulario del panel siempre reenvía el set completo de permisos
  // actuales (no solo los que cambiaron), así que el candado compara contra
  // lo que ya tiene el rol en vez de rechazar cualquier `permisos` presente.
  const rol = await Rol.findByPk(id, { include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }] });
  if (!rol) {
    throw new AppError('Rol no encontrado', 404);
  }

  if (parseInt(id) === 1) {
    if (permisos !== undefined) {
      const actuales = new Set(rol.permisos.map(p => p.idPermiso));
      const nuevos = new Set(permisos.map(Number));
      const sinCambios = actuales.size === nuevos.size && [...actuales].every(p => nuevos.has(p));
      if (!sinCambios) {
        throw new AppError('Los permisos del rol de administrador no se pueden modificar', 403);
      }
    }
    if (habilitado !== undefined && habilitado !== true) {
      throw new AppError('El rol de administrador no se puede inhabilitar', 403);
    }
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

const toggleHabilitado = async (id, idRolActual, idUsuarioActual) => {
  if (parseInt(id) === idRolActual) {
    throw new AppError('No puedes inhabilitar tu propio rol', 400);
  }

  const rol = await Rol.findByPk(id, {
    include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }]
  });
  if (!rol) {
    throw new AppError('Rol no encontrado', 404);
  }

  const inhabilitando = rol.habilitado === true;

  await rol.update({ habilitado: !rol.habilitado });

  if (inhabilitando) {
    // El admin id=1 nunca se inhabilita, ni siquiera en cascada al inhabilitar su rol
    // (misma garantía que usuarioService.toggleHabilitado aplica al inhabilitar de uno en uno).
    await Usuario.update(
      { habilitado: false },
      { where: { idRol: id, idUsuario: { [Op.notIn]: [idUsuarioActual, 1] } } }
    );
  } else {
    // Al habilitar el rol, re-habilitar todos los usuarios de ese rol
    await Usuario.update(
      { habilitado: true },
      { where: { idRol: id } }
    );
  }

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