const { Conductor, Usuario, Vehiculo, AnticipoExcedente, Ruta } = require('../models');
const bcrypt = require('bcryptjs');
const AppError = require('../errors/appError');
const { tieneRutasActivas, tieneVehiculosActivos, tieneAnticiposPendientes } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'apellido', 'estado', 'idConductor', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idConductor';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ estado, habilitado, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Conductor.findAndCountAll({
    where,
    include: [{ model: Usuario, as: 'usuario' }],
    limit,
    offset,
    order: order.length > 0 ? order : [['idConductor', 'ASC']],
    distinct: true,
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
  console.log('=== Creando conductor ===');
  console.log(data);

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
  console.log('Usuario creado con ID:', usuario.idUsuario);

  const conductor = await Conductor.create({
    idUsuario: usuario.idUsuario,
    categoriaLicencia: categoriaLicencia || 'B1',
    numeroLicencia: numeroLicencia || uniqueId,
    vencimientoLicencia: vencimientoLicencia,
    estado: 'activo'
  });

  console.log('Conductor creado con ID:', conductor.idConductor);

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
    const rutasActivas = await tieneRutasActivas(id);
    if (rutasActivas) throw new AppError('No se puede inhabilitar un conductor con rutas activas', 400);

    const vehiculosActivos = await tieneVehiculosActivos(id);
    if (vehiculosActivos) throw new AppError('No se puede inhabilitar un conductor con vehículos asignados activos', 400);

    const anticiposPendientes = await tieneAnticiposPendientes(id);
    if (anticiposPendientes) throw new AppError('No se puede inhabilitar un conductor con anticipos pendientes de legalización', 400);
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