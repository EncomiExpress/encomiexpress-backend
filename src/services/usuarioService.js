const bcrypt = require('bcryptjs');
const { Usuario, Rol } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { Conductor, Cliente } = require('../models');
const { tieneRutasActivas, tieneVehiculosActivos, tieneAnticiposPendientes, tieneEncomiendasActivasPorCliente } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'apellido', 'email', 'idUsuario', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idUsuario';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ habilitado, idRol, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (idRol !== undefined) where.idRol = idRol;
  if (q) {
    const query = `%${q.trim()}%`;
    const numericId = Number(q);
    const conditions = [
      { nombre: { [Op.iLike]: query } },
      { apellido: { [Op.iLike]: query } },
      { email: { [Op.iLike]: query } },
      { tipoIdentificacion: { [Op.iLike]: query } },
      { numeroIdentificacion: { [Op.iLike]: query } },
      { '$rol.nombre$': { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idUsuario: numericId });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;

  const include = [{ model: Rol, as: 'rol' }];
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Usuario.findAndCountAll({
    where,
    include,
    attributes: { exclude: ['password'] },
    limit,
    offset,
    order: order.length > 0 ? order : [['idUsuario', 'ASC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const usuario = await Usuario.findByPk(id, {
    include: [{ model: Rol, as: 'rol' }],
    attributes: { exclude: ['password'] }
  });

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  return usuario;
};

const create = async (data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, password, idRol } = data;

  const existingEmail = await Usuario.findOne({ where: { email } });
  if (existingEmail) {
    throw new AppError('El email ya está registrado', 400);
  }

  const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion } });
  if (existingDoc) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const usuario = await Usuario.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    password: hashedPassword,
    idRol
  });

  return {
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    nombre: usuario.nombre
  };
};

const update = async (id, data) => {
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, idRol, habilitado } = data;

  const usuario = await Usuario.findByPk(id);

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  try {
    const rol = await Rol.findByPk(usuario.idRol);
    if (rol && String(rol.nombre).toLowerCase() === 'admin') {
      throw new AppError('No se puede inhabilitar el usuario administrador', 400);
    }
  } catch (e) {
    // Si ocurre cualquier error al verificar rol, no bloquear explícitamente; dejar que otras validaciones manejen el caso.
  }

  if (email && email !== usuario.email) {
    const existingEmail = await Usuario.findOne({ where: { email } });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  if (numeroIdentificacion && numeroIdentificacion !== usuario.numeroIdentificacion) {
    const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion } });
    if (existingDoc) {
      throw new AppError('El número de identificación ya está registrado', 400);
    }
  }

  await usuario.update({
    tipoIdentificacion: tipoIdentificacion || usuario.tipoIdentificacion,
    numeroIdentificacion: numeroIdentificacion || usuario.numeroIdentificacion,
    nombre: nombre || usuario.nombre,
    apellido: apellido || usuario.apellido,
    telefono: telefono !== undefined ? telefono : usuario.telefono,
    email: email || usuario.email,
    idRol: idRol || usuario.idRol,
    habilitado: habilitado !== undefined ? habilitado : usuario.habilitado
  });

  return {
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    nombre: usuario.nombre
  };
};

const changePassword = async (id, { currentPassword, newPassword }) => {
  const usuario = await Usuario.findByPk(id);

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const isValid = await bcrypt.compare(currentPassword, usuario.password);
  if (!isValid) {
    throw new AppError('Password actual incorrecto', 400);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await usuario.update({ password: hashedPassword });

  return { message: 'Password actualizado exitosamente' };
};

const toggleHabilitado = async (id, currentUserId) => {
  if (parseInt(id) === currentUserId) {
    throw new AppError('No puedes inhabilitar tu propio usuario', 400);
  }
  const usuario = await Usuario.findByPk(id);

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  if (usuario.habilitado === true) {
    const conductor = await Conductor.findOne({ where: { idUsuario: usuario.idUsuario } });
    if (conductor) {
      const rutasActivas = await tieneRutasActivas(conductor.idConductor);
      if (rutasActivas) throw new AppError('No se puede inhabilitar el usuario porque el conductor asociado tiene rutas activas', 400);

      const vehiculosActivos = await tieneVehiculosActivos(conductor.idConductor);
      if (vehiculosActivos) throw new AppError('No se puede inhabilitar el usuario porque el conductor asociado tiene vehículos activos', 400);

      const anticiposPendientes = await tieneAnticiposPendientes(conductor.idConductor);
      if (anticiposPendientes) throw new AppError('No se puede inhabilitar el usuario porque el conductor asociado tiene anticipos pendientes', 400);
    }
    try {
      const cliente = await Cliente.findOne({ where: { numeroIdentificacion: usuario.numeroIdentificacion } });
      if (cliente) {
        const encomiendasActivas = await tieneEncomiendasActivasPorCliente(cliente.idCliente);
        if (encomiendasActivas) throw new AppError('No se puede inhabilitar el usuario porque el cliente asociado tiene encomiendas activas', 400);
      }
    } catch (e) {
      // No bloquear el flujo si ocurre un error al verificar cliente; dejar que la inhabilitación continúe según otras reglas.
    }
  }

  usuario.habilitado = !usuario.habilitado;
  await usuario.save();

  return usuario;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  changePassword,
  toggleHabilitado
};
