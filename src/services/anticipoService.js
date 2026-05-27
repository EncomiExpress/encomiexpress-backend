const { AnticipoExcedente, Conductor, Ruta, Vehiculo, Destino, Usuario } = require('../models');
const AppError = require('../errors/appError');

const getAll = async ({ idConductor, estado }) => {
  const where = {};
  if (idConductor) where.idConductor = idConductor;
  if (estado) where.estado = estado;

  const anticipos = await AnticipoExcedente.findAll({
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
    ]
  });

  return anticipos;
};

const getById = async (id) => {
  const anticipo = await AnticipoExcedente.findByPk(id, {
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
    ]
  });

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

  let idRutaFinal = idRuta;
  if (idRuta) {
    const ruta = await Ruta.findByPk(idRuta);
    if (!ruta) {
      throw new AppError('Ruta no encontrada', 404);
    }
    idRutaFinal = ruta.idRuta;
  }

  const anticipo = await AnticipoExcedente.create({
    idConductor,
    idRuta: idRutaFinal,
    valorAnticipo: valorAnticipo || 0,
    valorGastado: 0,
    excedente: 0,
    estado: 'pendiente',
    soporte,
    fechaEntrega
  });

  return anticipo;
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

  let newExcedente = excedente;
  if (valorGastado !== undefined) {
    newExcedente = anticipo.valorAnticipo - valorGastado;
  }

  await anticipo.update({
    valorGastado: valorGastado !== undefined ? valorGastado : anticipo.valorGastado,
    excedente: newExcedente !== undefined ? newExcedente : anticipo.excedente,
    estado: estado || anticipo.estado,
    soporte: soporte !== undefined ? soporte : anticipo.soporte,
    fechaEntrega: fechaEntrega !== undefined ? fechaEntrega : anticipo.fechaEntrega,
    fechaLegalizacion: fechaLegalizacion !== undefined ? fechaLegalizacion : anticipo.fechaLegalizacion,
    fechaEntregaExcedente: fechaEntregaExcedente !== undefined ? fechaEntregaExcedente : anticipo.fechaEntregaExcedente
  });

  return anticipo;
};

const liquidar = async (id, { valorGastado, soporte }) => {
  const anticipo = await AnticipoExcedente.findByPk(id);

  if (!anticipo) {
    throw new AppError('Anticipo no encontrado', 404);
  }

  if (anticipo.estado !== 'pendiente') {
    throw new AppError('El anticipo ya fue liquidado', 400);
  }

  const excedente = anticipo.valorAnticipo - valorGastado;

  await anticipo.update({
    valorGastado,
    excedente,
    estado: excedente >= 0 ? 'liquidado' : 'con excedente',
    soporte,
    fechaLegalizacion: new Date()
  });

  return anticipo;
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
    estado: 'excedente entregado',
    soporte: soporte || anticipo.soporte,
    fechaEntregaExcedente: new Date()
  });

  return anticipo;
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
    idRutaFinal = ruta.idRuta;
  }

  const anticipo = await AnticipoExcedente.create({
    idConductor: conductor.idConductor,
    idRuta: idRutaFinal,
    valorAnticipo: valorAnticipo || 0,
    valorGastado: 0,
    excedente: 0,
    estado: 'pendiente',
    soporte,
    fechaEntrega
  });

  return anticipo;
};

const cambiarEstado = async (id, estado) => {
  const estadosValidos = ['pendiente', 'entregado', 'en legalización', 'legalizado', 'excedente pendiente', 'cerrado'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }
  const anticipo = await AnticipoExcedente.findByPk(id);
  if (!anticipo) throw new AppError('Anticipo no encontrado', 404);
  anticipo.estado = estado;
  await anticipo.save();
  return anticipo;
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
    // No permitir inhabilitar anticipos que estén pendientes
    if (anticipo.estado === 'pendiente') {
      throw new AppError('No se puede inhabilitar un anticipo pendiente', 400);
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

  return anticipo;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  liquidar,
  entregarExcedente,
  createMisAnticipo,
  updateSoporte,
  cambiarEstado,
  toggleHabilitado
};