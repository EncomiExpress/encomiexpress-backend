const { AnticipoExcedente, Conductor, Ruta, Vehiculo, Destino, Usuario } = require('../models');
const AppError = require('../errors/appError');
const { Op } = require('sequelize');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = {
    fechaEntrega: 'fechaEntrega',
    estado: 'estado',
    idAnticipo: 'idAnticipoExcedente',
    habilitado: 'habilitado',
  };
  const parts = sortBy.split('.');
  const field = allowed[parts[0]] || 'idAnticipoExcedente';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ idConductor, idRuta, estado, habilitado, q, page = 1, limit = 10, sortBy } = {}) => {
  try {
    const where = {};
    if (idConductor) where.idConductor = idConductor;
    if (idRuta) where.idRuta = parseInt(idRuta);
    if (estado) where.estado = estado;
    if (habilitado !== undefined) where.habilitado = habilitado === 'true';
    if (q) {
      const query = `%${q.trim()}%`;
      const numericId = Number(q);
      const conditions = [
        { estado: { [Op.iLike]: query } },
        { soporte: { [Op.iLike]: query } },
        { '$conductor.usuario.nombre$': { [Op.iLike]: query } },
        { '$conductor.usuario.apellido$': { [Op.iLike]: query } },
        { '$ruta.nombreRuta$': { [Op.iLike]: query } },
      ];
      if (!Number.isNaN(numericId)) {
        conditions.unshift({ idAnticipoExcedente: numericId });
      }
      where[Op.or] = conditions;
    }

    const offset = (page - 1) * limit;
    const order = buildOrder(sortBy);

    const { count, rows: data } = await AnticipoExcedente.findAndCountAll({
      where,
      include: [
        { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
        {
          model: Ruta,
          as: 'ruta',
          include: [
            { model: Vehiculo, as: 'vehiculo' },
            { model: Destino, as: 'destino' }
          ]
        }
      ],
      limit,
      offset,
      order: order.length > 0 ? order : [['idAnticipoExcedente', 'DESC']],
      distinct: true,
    });

    return { data, total: count };
  } catch (error) {
    throw error;
  }
};

const ANTICIPO_INCLUDE = [
  { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
  {
    model: Ruta,
    as: 'ruta',
    include: [
      { model: Vehiculo, as: 'vehiculo' },
      { model: Destino, as: 'destino' }
    ]
  }
];

const getAnticipoCompleto = (id) =>
  AnticipoExcedente.findByPk(id, { include: ANTICIPO_INCLUDE });

const getById = async (id) => {
  const anticipo = await getAnticipoCompleto(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  return anticipo;
};

const create = async (data) => {
  const { idConductor, idRuta, valorAnticipo, soporte, fechaEntrega } = data;

  const conductor = await Conductor.findByPk(idConductor);
  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  if (conductor.vencimientoLicencia) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const venc = new Date(conductor.vencimientoLicencia); venc.setHours(0, 0, 0, 0);
    if (venc < hoy) throw new AppError('El conductor tiene la licencia de conducción vencida y no puede recibir anticipos', 400);
  }

  let idRutaFinal = idRuta;
  if (idRuta) {
    const ruta = await Ruta.findByPk(idRuta);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    const anticipoExistente = await AnticipoExcedente.findOne({
      where: { idRuta: parseInt(idRuta), habilitado: true, estado: { [Op.in]: ['Entregado', 'En Legalización'] } }
    });
    if (anticipoExistente) {
      throw new AppError('Esta ruta ya tiene un anticipo activo. Solo puede existir un anticipo por ruta a la vez.', 409);
    }
    idRutaFinal = ruta.idRuta;
  }

  const cleanDate = (value) => {
    if (value === null || value === '' || value === 'Invalid date') {
      return null;
    }
    return value;
  };

  const anticipo = await AnticipoExcedente.create({
    idConductor,
    idRuta: idRutaFinal,
    valorAnticipo: valorAnticipo || 0,
    valorGastado: 0,
    excedente: 0,
    estado: 'Entregado',
    soporte,
    fechaEntrega: cleanDate(fechaEntrega)
  });

  return getAnticipoCompleto(anticipo.idAnticipoExcedente);
};

const update = async (id, data) => {
  const {
    valorGastado,
    excedente,
    estado,
    soporte,
    fechaEntrega,
    fechaLegalizacion,
    fechaEntregaExcedente
  } = data;

  const anticipo = await AnticipoExcedente.findByPk(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  const cleanDate = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '' || value === 'Invalid date') return null;
    return value;
  };

  // Si se provee valorGastado, el estado y excedente se calculan automáticamente
  let autoEstado;
  let autoFechaLegalizacion;
  let newExcedente = excedente;

  if (valorGastado !== undefined) {
    newExcedente = parseFloat(anticipo.valorAnticipo) - parseFloat(valorGastado);
    autoEstado = newExcedente > 0 ? 'Excedente pendiente' : 'Completado';
    autoFechaLegalizacion = new Date();
  }

  const cleanedFechaEntrega = cleanDate(fechaEntrega);
  const cleanedFechaLegalizacion = cleanDate(fechaLegalizacion);
  const cleanedFechaEntregaExcedente = cleanDate(fechaEntregaExcedente);

  await anticipo.update({
    valorGastado: valorGastado !== undefined ? valorGastado : anticipo.valorGastado,
    excedente: newExcedente !== undefined ? newExcedente : anticipo.excedente,
    estado: autoEstado || estado || anticipo.estado,
    soporte: soporte !== undefined ? soporte : anticipo.soporte,
    fechaEntrega: cleanedFechaEntrega !== undefined ? cleanedFechaEntrega : anticipo.fechaEntrega,
    fechaLegalizacion: autoFechaLegalizacion || (cleanedFechaLegalizacion !== undefined ? cleanedFechaLegalizacion : anticipo.fechaLegalizacion),
    fechaEntregaExcedente: cleanedFechaEntregaExcedente !== undefined ? cleanedFechaEntregaExcedente : anticipo.fechaEntregaExcedente
  });

  return getAnticipoCompleto(id);
};

const entregarExcedente = async (id, { soporte }) => {
  const anticipo = await AnticipoExcedente.findByPk(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  if (anticipo.excedente <= 0) {
    throw new AppError('No hay excedente para entregar', 400);
  }

  await anticipo.update({
    estado: 'Completado',
    soporte: soporte || anticipo.soporte,
    fechaEntregaExcedente: new Date()
  });

  return getAnticipoCompleto(id);
};


const createMisAnticipo = async (idUsuario, rolNombre, data) => {
  if (rolNombre !== 'conductor') {
    throw new AppError('Solo los conductores pueden crear anticipos', 403);
  }

  const conductor = await Conductor.findOne({
    where: { idUsuario }
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  const { idRuta, valorAnticipo, soporte, fechaEntrega } = data;

  let idRutaFinal = idRuta;
  if (idRuta) {
    const ruta = await Ruta.findByPk(idRuta);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    const anticipoExistente = await AnticipoExcedente.findOne({
      where: { idRuta: parseInt(idRuta), habilitado: true, estado: { [Op.in]: ['Entregado', 'En Legalización'] } }
    });
    if (anticipoExistente) {
      throw new AppError('Esta ruta ya tiene un anticipo activo. Solo puede existir un anticipo por ruta a la vez.', 409);
    }
    idRutaFinal = ruta.idRuta;
  }

  const cleanDate = (value) => {
    if (value === null || value === '' || value === 'Invalid date') {
      return null;
    }
    return value;
  };

  const anticipo = await AnticipoExcedente.create({
    idConductor: conductor.idConductor,
    idRuta: idRutaFinal,
    valorAnticipo: valorAnticipo || 0,
    valorGastado: 0,
    excedente: 0,
    estado: 'Entregado',
    soporte,
    fechaEntrega: cleanDate(fechaEntrega)
  });

  return getAnticipoCompleto(anticipo.idAnticipoExcedente);
};

const cambiarEstado = async (id, estado) => {
  const estadosValidos = ['Entregado', 'En Legalización', 'Excedente pendiente', 'Completado'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) throw new AppError('Anticipo no encontrado', 404);

  const noRevertibles = ['En Legalización', 'Excedente pendiente', 'Completado'];
  if (noRevertibles.includes(anticipo.estado) && estado === 'Entregado') {
    throw new AppError(
      `No se puede revertir a "entregado" desde el estado "${anticipo.estado}". Este cambio es irreversible.`,
      400
    );
  }

  anticipo.estado = estado;
  await anticipo.save();
  return getAnticipoCompleto(id);
};

const updateSoporte = async (id, fileUrl) => {
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  await anticipo.update({ soporte: fileUrl });

  return { soporte: fileUrl };
};

const toggleHabilitado = async (id) => {
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
  if (anticipo.habilitado === true) {
    if (anticipo.estado !== 'Completado') {
      throw new AppError(
        'No se puede inhabilitar un anticipo que aún no ha sido cerrado',
        409,
        [{
          tipo: 'Estado del anticipo',
          id: anticipo.idAnticipoExcedente,
          descripcion: `Anticipo #${anticipo.idAnticipoExcedente} con valor $${anticipo.valorAnticipo} está en estado "${anticipo.estado}" y no ha sido cerrado aún`
        }],
        'DEPENDENCY_CONFLICT'
      );
    }
  }
  anticipo.habilitado = !anticipo.habilitado;
  await anticipo.save();

  try {
    const app = require('../app');
    const io = app.get('io');
    if (io) io.emit('anticipo_updated', anticipo);
  } catch (e) {
    // no bloquear por fallos al emitir eventos
  }

  return getAnticipoCompleto(id);
};

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await AnticipoExcedente.findByPk(id, { attributes: ['idAnticipoExcedente', 'fechaEntrega'] });
  if (!record) throw new AppError('Anticipo no encontrado', 404);
  // La lista ordena por fechaEntrega DESC; para igual fecha Postgres usa orden de inserción (id ASC)
  const before = await AnticipoExcedente.count({
    where: {
      [Op.or]: [
        { fechaEntrega: { [Op.gt]: record.fechaEntrega } },
        { fechaEntrega: record.fechaEntrega, idAnticipoExcedente: { [Op.lt]: parseInt(id) } },
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
  entregarExcedente,
  createMisAnticipo,
  updateSoporte,
  cambiarEstado,
  toggleHabilitado,
  getPageOf,
};