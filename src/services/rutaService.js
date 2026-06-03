const { Ruta, Vehiculo, Conductor, Destino, EncomiendaVenta, Usuario, Cliente } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { tieneEncomiendasActivasPorRuta } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaSalida', 'estado', 'idRuta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaSalida';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const buildRutaWhere = ({ habilitado, estado, anio, mes, q }) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estado) where.estado = estado;
  if (anio || mes) {
    where.fechaSalida = {};
    if (anio) where.fechaSalida[Op.like] = `${anio}%`;
    if (mes) where.fechaSalida[Op.like] = `${anio ? anio + '-' : ''}${mes.padStart ? mes.padStart(2, '0') : mes}%`;
  }
  if (q) {
    where[Op.or] = [
      { nombreRuta: { [Op.iLike]: `%${q}%` } },
      { fechaSalida: { [Op.iLike]: `%${q}%` } },
      { '$vehiculo.placa$': { [Op.iLike]: `%${q}%` } },
      { '$conductor.usuario.nombre$': { [Op.iLike]: `%${q}%` } },
      { '$conductor.usuario.apellido$': { [Op.iLike]: `%${q}%` } },
    ];
  }
  return where;
};

const getAll = async ({ habilitado, estado, anio, mes, page = 1, limit = 10, sortBy, q } = {}) => {
  const where = buildRutaWhere({ habilitado, estado, anio, mes, q });

  const offset = (page - 1) * limit;
  const order = buildOrder(sortBy);

  const include = [
    { model: Vehiculo, as: 'vehiculo' },
    { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
    { model: Destino, as: 'destino' },
  ];

  const { count, rows: data } = await Ruta.findAndCountAll({
    where,
    include,
    limit,
    offset,
    order: order.length > 0 ? order : [['fechaSalida', 'DESC'], ['horaSalida', 'DESC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const ruta = await Ruta.findByPk(id, {
    include: [
      { model: Vehiculo, as: 'vehiculo' },
      { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
      { model: Destino, as: 'destino' }
    ]
  });

  if (!ruta) {
    throw new AppError('Ruta no encontrada', 404);
  }

  return ruta;
};

const create = async (data) => {
  const { idVehiculo, idConductor, idDestino, nombreRuta, fechaSalida, horaSalida, horaLlegadaEstimada, estado, observaciones } = data;

  const vehiculo = await Vehiculo.findByPk(idVehiculo);
  if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);

  const conductor = await Conductor.findByPk(idConductor);
  if (!conductor) throw new AppError('Conductor no encontrado', 404);

  const destino = await Destino.findByPk(idDestino);
  if (!destino) throw new AppError('Destino no encontrado', 404);

  const ruta = await Ruta.create({
    nombreRuta: nombreRuta || null,
    idVehiculo,
    idConductor,
    idDestino,
    fechaSalida: fechaSalida || null,
    horaSalida: horaSalida || null,
    horaLlegadaEstimada: horaLlegadaEstimada || null,
    estado: estado || 'Programada',
    observaciones: observaciones || null
  });

  return ruta;
};

const update = async (id, data) => {
  const { idVehiculo, idConductor, idDestino, nombreRuta, fechaSalida, horaSalida, horaLlegadaEstimada, estado, observaciones, habilitado } = data;

  const ruta = await Ruta.findByPk(id);
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  await ruta.update({
    nombreRuta:            nombreRuta            !== undefined ? nombreRuta            : ruta.nombreRuta,
    idVehiculo:            idVehiculo            !== undefined ? idVehiculo            : ruta.idVehiculo,
    idConductor:           idConductor           !== undefined ? idConductor           : ruta.idConductor,
    idDestino:             idDestino             !== undefined ? idDestino             : ruta.idDestino,
    fechaSalida:           fechaSalida           !== undefined ? fechaSalida           : ruta.fechaSalida,
    horaSalida:            horaSalida            !== undefined ? horaSalida            : ruta.horaSalida,
    horaLlegadaEstimada:   horaLlegadaEstimada   !== undefined ? horaLlegadaEstimada   : ruta.horaLlegadaEstimada,
    estado:                estado                !== undefined ? estado                : ruta.estado,
    observaciones:         observaciones         !== undefined ? observaciones         : ruta.observaciones,
    habilitado:            habilitado            !== undefined ? habilitado            : ruta.habilitado
  });

  return ruta;
};

const updateEstado = async (id, estado) => {
  const estadosValidos = ['Programada', 'En Curso', 'Completada', 'Cancelada'];
  if (!estadosValidos.includes(estado)) {
    throw new AppError(`Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`, 400);
  }

  const ruta = await Ruta.findByPk(id);
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  if (ruta.estado === 'Completada') {
    throw new AppError('No se puede cambiar el estado de una ruta completada', 400);
  }

  ruta.estado = estado;
  await ruta.save();
  return ruta;
};

const getEncomiendas = async (id) => {
  const ruta = await Ruta.findByPk(id);
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  const encomiendas = await EncomiendaVenta.findAll({
    where: { idRuta: id },
    include: [{ model: Cliente, as: 'cliente' }]
  });

  return encomiendas;
};

const getAvailable = async ({ idDestino }) => {
  const where = { habilitado: true };
  if (idDestino) where.idDestino = idDestino;

  const rutas = await Ruta.findAll({
    where,
    include: [
      { model: Vehiculo, as: 'vehiculo' },
      { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
      { model: Destino, as: 'destino' }
    ]
  });

  return rutas;
};

const toggleHabilitado = async (id) => {
  const ruta = await Ruta.findByPk(id);
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  if (ruta.habilitado === true) {
    const encomiendasActivas = await tieneEncomiendasActivasPorRuta(id);
    if (encomiendasActivas) throw new AppError('No se puede inhabilitar una ruta con encomiendas activas', 400);
  }

  ruta.habilitado = !ruta.habilitado;
  await ruta.save();
  return ruta;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  updateEstado,
  getEncomiendas,
  getAvailable,
  toggleHabilitado
};