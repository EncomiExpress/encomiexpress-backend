const { Conductor, Usuario, AnticipoExcedente, Ruta, Vehiculo } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const AppError = require('../errors/appError');
const { verificarDependenciasConductor } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const parts = sortBy.split('.');
  const field = parts[0];
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en el campo ordenado pueden
  // salir en distinto orden relativo según el LIMIT de cada consulta.
  if (['nombre', 'apellido'].includes(field)) {
    return [[{ model: Usuario, as: 'usuario' }, field, direction], ['idConductor', direction]];
  }
  const allowedDirect = ['estado', 'idConductor', 'habilitado', 'numeroLicencia'];
  const resolvedField = allowedDirect.includes(field) ? field : 'idConductor';
  if (resolvedField === 'idConductor') return [[resolvedField, direction]];
  return [[resolvedField, direction], ['idConductor', direction]];
};

const getAll = async ({ estado, habilitado, q, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (q) {
    const trimmed = q.trim();
    const query = `%${trimmed}%`;
    const numericId = Number(q);
    const conditions = [
      { '$usuario.nombre$': { [Op.iLike]: query } },
      { '$usuario.apellido$': { [Op.iLike]: query } },
      { '$usuario.telefono$': { [Op.iLike]: query } },
      { '$usuario.email$': { [Op.iLike]: query } },
      { '$usuario.tipo_identificacion$': { [Op.iLike]: query } },
      { '$usuario.numero_identificacion$': { [Op.iLike]: query } },
      { numeroLicencia: { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idConductor: numericId });
    }
    const partes = trimmed.split(/\s+/).filter(Boolean);
    if (partes.length > 1) {
      const primero = `%${partes[0]}%`;
      const resto = `%${partes.slice(1).join(' ')}%`;
      conditions.push({ [Op.and]: [{ '$usuario.nombre$': { [Op.iLike]: primero } }, { '$usuario.apellido$': { [Op.iLike]: resto } }] });
      conditions.push({ [Op.and]: [{ '$usuario.apellido$': { [Op.iLike]: primero } }, { '$usuario.nombre$': { [Op.iLike]: resto } }] });
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
    order: order.length > 0 ? order : [['idConductor', 'DESC']],
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
    categoriasLicencia,
    numeroLicencia,
  } = data;

  const existingEmail = await Usuario.findOne({ where: { email } });
  if (existingEmail) {
    throw new AppError('El email ya está registrado', 400);
  }

  const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion } });
  if (existingDoc) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  if (numeroLicencia) {
    const existingLicencia = await Conductor.findOne({ where: { numeroLicencia } });
    if (existingLicencia) {
      throw new AppError('El número de licencia ya está registrado', 400);
    }
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
    categoriasLicencia: categoriasLicencia || [],
    numeroLicencia: numeroLicencia || null,
    estado: 'activo',
  });

  return Conductor.findByPk(conductor.idConductor, {
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }],
  });
};

const update = async (id, data) => {
  const {
    categoriasLicencia,
    numeroLicencia,
    estado,
    habilitado,
    nombre,
    apellido,
    telefono,
    email,
    tipoIdentificacion,
    numeroIdentificacion,
    password
  } = data;

  const conductor = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario' }]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  if (numeroLicencia && numeroLicencia !== conductor.numeroLicencia) {
    const existingLicencia = await Conductor.findOne({
      where: { numeroLicencia, idConductor: { [Op.ne]: id } },
    });
    if (existingLicencia) {
      throw new AppError('El número de licencia ya está registrado', 400);
    }
  }

  if (conductor.usuario) {
    if (numeroIdentificacion && numeroIdentificacion !== conductor.usuario.numeroIdentificacion) {
      const existingDoc = await Usuario.findOne({
        where: { numeroIdentificacion, idUsuario: { [Op.ne]: conductor.usuario.idUsuario } },
      });
      if (existingDoc) {
        throw new AppError('El número de identificación ya está registrado', 400);
      }
    }
    if (email && email !== conductor.usuario.email) {
      const existingEmail = await Usuario.findOne({
        where: { email, idUsuario: { [Op.ne]: conductor.usuario.idUsuario } },
      });
      if (existingEmail) {
        throw new AppError('El email ya está registrado', 400);
      }
    }
  }

  await conductor.update({
    categoriasLicencia: categoriasLicencia !== undefined ? categoriasLicencia : conductor.categoriasLicencia,
    numeroLicencia: numeroLicencia !== undefined ? numeroLicencia : conductor.numeroLicencia,
    estado: estado || conductor.estado,
    habilitado: habilitado !== undefined ? habilitado : conductor.habilitado
  });

  if (conductor.usuario) {
    const datosUsuario = {
      nombre: nombre !== undefined ? nombre : conductor.usuario.nombre,
      apellido: apellido !== undefined ? apellido : conductor.usuario.apellido,
      telefono: telefono !== undefined ? telefono : conductor.usuario.telefono,
      email: email !== undefined ? email : conductor.usuario.email,
      tipoIdentificacion: tipoIdentificacion !== undefined ? tipoIdentificacion : conductor.usuario.tipoIdentificacion,
      numeroIdentificacion: numeroIdentificacion !== undefined ? numeroIdentificacion : conductor.usuario.numeroIdentificacion,
    };
    if (password) {
      datosUsuario.password = await bcrypt.hash(password, 10);
    }
    await conductor.usuario.update(datosUsuario);
  }

  const conductorActualizado = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }]
  });

  return conductorActualizado;
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

const getMiPerfil = async (idUsuario, rolNombre) => {
  if (rolNombre !== 'conductor') {
    throw new AppError('Solo los conductores pueden acceder a su perfil', 403);
  }

  const conductor = await Conductor.findOne({
    where: { idUsuario },
    include: [
      { model: Usuario, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellido', 'telefono', 'email', 'tipoIdentificacion', 'numeroIdentificacion'] },
      {
        model: Ruta,
        as: 'rutas',
        where: { estado: 'En Curso' },
        required: false,
        include: [{ model: Vehiculo, as: 'vehiculo', attributes: ['idVehiculo', 'placa', 'marca', 'modelo', 'color', 'tipo', 'capacidad'] }],
      },
    ]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  // No existe una asignación fija conductor→vehículo en el modelo de datos — el vehículo
  // que se muestra es el de la ruta que el conductor tiene "En Curso" en este momento, si hay una.
  const vehiculo = conductor.rutas && conductor.rutas.length > 0 ? conductor.rutas[0].vehiculo : null;

  return {
    id: conductor.usuario.idUsuario,
    nombre: conductor.usuario.nombre,
    apellido: conductor.usuario.apellido,
    telefono: conductor.usuario.telefono,
    email: conductor.usuario.email,
    tipoIdentificacion: conductor.usuario.tipoIdentificacion,
    numeroIdentificacion: conductor.usuario.numeroIdentificacion,
    conductorId: conductor.idConductor,
    categoriasLicencia: conductor.categoriasLicencia,
    numeroLicencia: conductor.numeroLicencia,
    placa: vehiculo?.placa,
    marca: vehiculo?.marca,
    modelo: vehiculo?.modelo,
    color: vehiculo?.color,
    tipo: vehiculo?.tipo,
    capacidad: vehiculo?.capacidad,
  };
};

const actualizarMiPerfil = async (idUsuario, rolNombre, data) => {
  if (rolNombre !== 'conductor') {
    throw new AppError('Solo los conductores pueden actualizar su perfil', 403);
  }

  const conductor = await Conductor.findOne({ where: { idUsuario } });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  const { nombre, telefono, email, numeroIdentificacion, direccion, categoriasLicencia, numeroLicencia } = data;

  const t = await sequelize.transaction();

  try {
    await Usuario.update(
      { ...(nombre && { nombre }), ...(telefono && { telefono }), ...(email && { email }), ...(numeroIdentificacion && { numeroIdentificacion }), ...(direccion && { direccion }) },
      { where: { idUsuario }, transaction: t }
    );

    await conductor.update(
      { ...(categoriasLicencia !== undefined && { categoriasLicencia }), ...(numeroLicencia !== undefined && { numeroLicencia }) },
      { transaction: t }
    );

    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }
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
  const conductor = await Conductor.findByPk(id, {
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }],
  });
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
  getAnticipos,
  cambiarEstado,
  getMiPerfil,
  actualizarMiPerfil,
  getMisAnticipos,
  toggleHabilitado,
  getPageOf,
};