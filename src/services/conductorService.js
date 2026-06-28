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
  } = data;

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
    idRol: 2,
    habilitado: true,
  });

  const conductor = await Conductor.create({
    idUsuario: usuario.idUsuario,
    categoriaLicencia: categoriaLicencia || null,
    numeroLicencia: numeroLicencia || null,
    vencimientoLicencia: vencimientoLicencia || null,
    estado: 'activo',
  });

  return Conductor.findByPk(conductor.idConductor, {
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }],
  });
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
  const ESTADOS_VALIDOS = ['Disponible', 'En Ruta'];

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

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await Conductor.findByPk(id, { attributes: ['idConductor'] });
  if (!record) throw new AppError('Conductor no encontrado', 404);
  const before = await Conductor.count({
    where: { idConductor: { [Op.lt]: parseInt(id) } },
  });
  return { page: Math.floor(before / limit) + 1 };
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
  toggleHabilitado,
  getPageOf,
};