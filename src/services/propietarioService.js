const { PropietarioVehiculo } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasPropietario } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['nombre', 'apellido', 'idPropietario', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idPropietario';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  // Desempate por id: sin esto, filas con el mismo valor en "field" pueden salir en
  // distinto orden relativo según el LIMIT de cada consulta.
  if (field === 'idPropietario') return [[field, direction]];
  return [[field, direction], ['idPropietario', direction]];
};

const getAll = async ({ habilitado, q, tipoFlota, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (tipoFlota) where.tipoFlota = tipoFlota;
  if (q) {
    const trimmed = q.trim();
    const query = `%${trimmed}%`;
    const conditions = [
      { nombre: { [Op.iLike]: query } },
      { apellido: { [Op.iLike]: query } },
      { numeroIdentificacion: { [Op.iLike]: query } },
      { email: { [Op.iLike]: query } },
      { telefono: { [Op.iLike]: query } },
    ];
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

  const { count, rows: data } = await PropietarioVehiculo.findAndCountAll({
    where,
    limit,
    offset,
    order: order.length > 0 ? order : [['idPropietario', 'DESC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const propietario = await PropietarioVehiculo.findByPk(id);

  if (!propietario) {
    throw new AppError('Propietario no encontrado', 404);
  }

  return propietario;
};

const create = async (data) => {
  const {
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    tipoFlota
  } = data;

  const existingDoc = await PropietarioVehiculo.findOne({ where: { numeroIdentificacion } });
  if (existingDoc) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  // Evita duplicados de nombre+apellido cuando no es una persona jurídica (NIT),
  // igual que la advertencia que ya existe en el frontend, pero exigido también
  // aquí para que la regla se cumpla sin importar el cliente que llame a la API.
  if (tipoIdentificacion !== 'NIT' && nombre && apellido) {
    const existingName = await PropietarioVehiculo.findOne({
      where: { nombre: { [Op.iLike]: nombre }, apellido: { [Op.iLike]: apellido } },
    });
    if (existingName) {
      throw new AppError('Ya existe un registro con este nombre y apellido. Verifica que no sea un duplicado.', 400);
    }
  }

  if (email) {
    const existingEmail = await PropietarioVehiculo.findOne({ where: { email } });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  const propietario = await PropietarioVehiculo.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    tipoFlota
  });

  return propietario;
};

const update = async (id, data) => {
  const {
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    tipoFlota,
    habilitado
  } = data;

  const propietario = await PropietarioVehiculo.findByPk(id);

  if (!propietario) {
    throw new AppError('Propietario no encontrado', 404);
  }

  if (numeroIdentificacion && numeroIdentificacion !== propietario.numeroIdentificacion) {
    const existingDoc = await PropietarioVehiculo.findOne({
      where: { numeroIdentificacion, idPropietario: { [Op.ne]: id } },
    });
    if (existingDoc) {
      throw new AppError('El número de identificación ya está registrado', 400);
    }
  }

  if (email && email !== propietario.email) {
    const existingEmail = await PropietarioVehiculo.findOne({
      where: { email, idPropietario: { [Op.ne]: id } },
    });
    if (existingEmail) {
      throw new AppError('El email ya está registrado', 400);
    }
  }

  const tipoIdentificacionEfectivo = tipoIdentificacion || propietario.tipoIdentificacion;
  if (tipoIdentificacionEfectivo !== 'NIT' && nombre && apellido &&
      (nombre !== propietario.nombre || apellido !== propietario.apellido)) {
    const existingName = await PropietarioVehiculo.findOne({
      where: {
        nombre: { [Op.iLike]: nombre },
        apellido: { [Op.iLike]: apellido },
        idPropietario: { [Op.ne]: id },
      },
    });
    if (existingName) {
      throw new AppError('Ya existe un registro con este nombre y apellido. Verifica que no sea un duplicado.', 400);
    }
  }

  await propietario.update({
    tipoIdentificacion: tipoIdentificacion || propietario.tipoIdentificacion,
    numeroIdentificacion: numeroIdentificacion || propietario.numeroIdentificacion,
    nombre: nombre || propietario.nombre,
    apellido: apellido || propietario.apellido,
    telefono: telefono !== undefined ? telefono : propietario.telefono,
    email: email !== undefined ? email : propietario.email,
    tipoFlota: tipoFlota !== undefined ? tipoFlota : propietario.tipoFlota,
    habilitado: habilitado !== undefined ? habilitado : propietario.habilitado
  });

  return propietario;
};


// El orden por defecto de getAll es idPropietario DESC, así que "antes" en la
// lista significa id MAYOR (Op.gt), no menor.
const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await PropietarioVehiculo.findByPk(id, { attributes: ['idPropietario'] });
  if (!record) throw new AppError('Propietario no encontrado', 404);
  const before = await PropietarioVehiculo.count({
    where: { idPropietario: { [Op.gt]: parseInt(id) } },
  });
  const page = Math.floor(before / limit) + 1;
  const row = (before % limit) + 1;
  return { page, row };
};

const toggleHabilitado = async (id) => {
  const propietario = await PropietarioVehiculo.findByPk(id);
  if (!propietario) throw new AppError('Propietario no encontrado', 404);
  if (propietario.habilitado === true) {
    const { bloqueado, dependencias } = await verificarDependenciasPropietario(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar este propietario porque tiene vehículos activos asociados',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }
  propietario.habilitado = !propietario.habilitado;
  await propietario.save();
  return propietario;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  toggleHabilitado,
  getPageOf,
};