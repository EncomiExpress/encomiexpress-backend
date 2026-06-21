const { Conductor, Usuario, Vehiculo, AnticipoExcedente, Ruta } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const AppError = require('../errors/appError');
const { verificarDependenciasConductor } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const parts = sortBy.split('.');
  const field = parts[0];
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  if (['nombre', 'apellido'].includes(field)) {
    return [[{ model: Usuario, as: 'usuario' }, field, direction]];
  }
  const allowedDirect = ['estado', 'idConductor', 'habilitado', 'categoriaLicencia', 'numeroLicencia'];
  return [[allowedDirect.includes(field) ? field : 'idConductor', direction]];
};

const getAll = async ({ estado, habilitado, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (q) {
    const query = `%${q.trim()}%`;
    const numericId = Number(q);
    const conditions = [
      { '$usuario.nombre$': { [Op.iLike]: query } },
      { '$usuario.apellido$': { [Op.iLike]: query } },
      { '$usuario.telefono$': { [Op.iLike]: query } },
      { '$usuario.email$': { [Op.iLike]: query } },
      { '$usuario.tipoIdentificacion$': { [Op.iLike]: query } },
      { '$usuario.numeroIdentificacion$': { [Op.iLike]: query } },
      { categoriaLicencia: { [Op.iLike]: query } },
      { numeroLicencia: { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idConductor: numericId });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Conductor.findAndCountAll({
    where,
    include: [{ model: Usuario, as: 'usuario' }],
    limit,
    offset,
    order: order.length > 0 ? order : [['idConductor', 'ASC']],
    distinct: true,
    subQuery: false,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const conductor = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario' }]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  return conductor;
};

const create = async (data) => {
  const {
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    password,
    categoriaLicencia,
    numeroLicencia,
    vencimientoLicencia,
    idRol
  } = data;

  const uniqueId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const finalNumId = numeroIdentificacion || uniqueId;
  const finalEmail = email || `conductor${uniqueId}@test.com`;

  const hashedPassword = await bcrypt.hash(password || '123456', 10);

  const usuarioData = {
    tipoIdentificacion: tipoIdentificacion || 'CC',
    numeroIdentificacion: finalNumId,
    nombre: nombre || 'Conductor',
    apellido: apellido || 'Nuevo',
    telefono: telefono || uniqueId,
    email: finalEmail,
    password: hashedPassword,
    idRol: idRol || 3,
    habilitado: true
  };

  const usuario = await Usuario.create(usuarioData);

  const conductor = await Conductor.create({
    idUsuario: usuario.idUsuario,
    categoriaLicencia: categoriaLicencia || 'B1',
    numeroLicencia: numeroLicencia || uniqueId,
    vencimientoLicencia: vencimientoLicencia,
    estado: 'activo'
  });

  return {
    idConductor: conductor.idConductor,
    idUsuario: conductor.idUsuario,
    nombre: `${nombre || 'Conductor'} ${apellido || 'Nuevo'}`,
    email: finalEmail
  };
};

const update = async (id, data) => {
  const {
    categoriaLicencia,
    numeroLicencia,
    vencimientoLicencia,
    estado,
    habilitado,
    nombre,
    apellido,
    telefono,
    email,
    tipoIdentificacion,
    numeroIdentificacion
  } = data;

  const conductor = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario' }]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  await conductor.update({
    categoriaLicencia: categoriaLicencia !== undefined ? categoriaLicencia : conductor.categoriaLicencia,
    numeroLicencia: numeroLicencia !== undefined ? numeroLicencia : conductor.numeroLicencia,
    vencimientoLicencia: vencimientoLicencia !== undefined ? vencimientoLicencia : conductor.vencimientoLicencia,
    estado: estado || conductor.estado,
    habilitado: habilitado !== undefined ? habilitado : conductor.habilitado
  });

  if (conductor.usuario) {
    await conductor.usuario.update({
      nombre: nombre !== undefined ? nombre : conductor.usuario.nombre,
      apellido: apellido !== undefined ? apellido : conductor.usuario.apellido,
      telefono: telefono !== undefined ? telefono : conductor.usuario.telefono,
      email: email !== undefined ? email : conductor.usuario.email,
      tipoIdentificacion: tipoIdentificacion !== undefined ? tipoIdentificacion : conductor.usuario.tipoIdentificacion,
      numeroIdentificacion: numeroIdentificacion !== undefined ? numeroIdentificacion : conductor.usuario.numeroIdentificacion,
    });
  }

  const conductorActualizado = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }]
  });

  return conductorActualizado;
};


const getVehiculos = async (id) => {
  const conductor = await Conductor.findByPk(id);
  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  const vehiculos = await Vehiculo.findAll({
    where: { idConductor: id }
  });

  return vehiculos;
};

const getAnticipos = async (id) => {
  const conductor = await Conductor.findByPk(id);
  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  const anticipos = await AnticipoExcedente.findAll({
    where: { idConductor: id },
    include: [{ model: Ruta, as: 'ruta' }]
  });

  return anticipos;
};

const cambiarEstado = async (id, estado) => {
  const ESTADOS_VALIDOS = ['activo', 'inactivo'];

  if (!estado) {
    throw new AppError('El campo "estado" es requerido', 400);
  }

  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new AppError(`Estado inválido. Los estados permitidos son: ${ESTADOS_VALIDOS.join(', ')}`, 400);
  }

  const conductor = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario' }]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  const estadoAnterior = conductor.estado;
  await conductor.update({ estado });

  return {
    idConductor: conductor.idConductor,
    nombre: `${conductor.usuario.nombre} ${conductor.usuario.apellido}`,
    estadoAnterior,
    estadoActual: estado
  };
};

const getMisAnticipos = async (idUsuario, rolNombre) => {
  if (rolNombre !== 'conductor') {
    throw new AppError('Solo los conductores pueden acceder a esta información', 403);
  }

  const conductor = await Conductor.findOne({
    where: { idUsuario }
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  const anticipos = await AnticipoExcedente.findAll({
    where: { idConductor: conductor.idConductor },
    include: [{ model: Ruta, as: 'ruta' }]
  });

  return anticipos;
};
const toggleHabilitado = async (id) => {
  const conductor = await Conductor.findByPk(id);
  if (!conductor) throw new AppError('Conductor no encontrado', 404);

  if (conductor.habilitado === true) {
    const { bloqueado, dependencias } = await verificarDependenciasConductor(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar este conductor porque tiene rutas en curso o anticipos pendientes',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  conductor.habilitado = !conductor.habilitado;
  await conductor.save();
  return conductor;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  getVehiculos,
  getAnticipos,
  cambiarEstado,
  getMisAnticipos,
  toggleHabilitado
};