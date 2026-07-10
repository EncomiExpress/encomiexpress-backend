const { Ruta, Vehiculo, Conductor, Destino, EncomiendaVenta, Usuario, Cliente, AnticipoExcedente } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasRuta } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['fechaSalida', 'estado', 'idRuta', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'fechaSalida';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const buildRutaWhere = ({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino }) => {
  const where = {};
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (estado) where.estado = estado;
  if (idConductor) where.idConductor = parseInt(idConductor);
  if (idVehiculo) where.idVehiculo = parseInt(idVehiculo);
  if (idDestino) where.idDestino = parseInt(idDestino);
  if (anio || mes) {
    where.fechaSalida = {};
    if (anio) where.fechaSalida[Op.like] = `${anio}%`;
    if (mes) where.fechaSalida[Op.like] = `${anio ? anio + '-' : ''}${mes.padStart ? mes.padStart(2, '0') : mes}%`;
  }
  if (q) {
    where[Op.or] = [
      { nombreRuta: { [Op.iLike]: `%${q}%` } },
      { '$vehiculo.placa$': { [Op.iLike]: `%${q}%` } },
      { '$conductor.usuario.nombre$': { [Op.iLike]: `%${q}%` } },
      { '$conductor.usuario.apellido$': { [Op.iLike]: `%${q}%` } },
    ];
  }
  return where;
};

const getAll = async ({ habilitado, estado, anio, mes, page = 1, limit = 10, sortBy, q, idConductor, idVehiculo, idDestino } = {}) => {
  const where = buildRutaWhere({ habilitado, estado, anio, mes, q, idConductor, idVehiculo, idDestino });

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
    subQuery: false,
  });

  const enCursoIds = data.filter(r => r.estado === 'En Curso').map(r => r.idRuta);
  if (enCursoIds.length > 0) {
    const pendientes = await AnticipoExcedente.findAll({
      where: { idRuta: { [Op.in]: enCursoIds }, estado: 'En Legalización', habilitado: true },
      attributes: ['idRuta'],
    });
    const pendientesSet = new Set(pendientes.map(a => a.idRuta));
    data.forEach(r => { r.dataValues.pendienteLegalizacion = pendientesSet.has(r.idRuta); });
  }

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

const validarDocumentosVehiculo = (vehiculo) => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const docs = [
    { campo: vehiculo.vencimientoSOAT,              nombre: 'SOAT' },
    { campo: vehiculo.vencimientoRevisionTecnica,   nombre: 'Revisión Técnico-Mecánica' },
    { campo: vehiculo.vencimientoSeguroTerceros,    nombre: 'Seguro de Terceros' },
  ];
  for (const { campo, nombre } of docs) {
    if (campo) {
      const venc = new Date(campo); venc.setHours(0, 0, 0, 0);
      if (venc < hoy) throw new AppError(`El vehículo tiene el ${nombre} vencido y no puede ser asignado a una ruta`, 400);
    }
  }
};

const create = async (data) => {
  const { idVehiculo, idConductor, idDestino, nombreRuta, fechaSalida, horaSalida, horaLlegadaEstimada, estado, observaciones } = data;

  const vehiculo = await Vehiculo.findByPk(idVehiculo);
  if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);
  validarDocumentosVehiculo(vehiculo);

  const conductor = await Conductor.findByPk(idConductor);
  if (!conductor) throw new AppError('Conductor no encontrado', 404);

  if (conductor.vencimientoLicencia) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const venc = new Date(conductor.vencimientoLicencia); venc.setHours(0, 0, 0, 0);
    if (venc < hoy) throw new AppError('El conductor tiene la licencia de conducción vencida y no puede ser asignado a una ruta', 400);
  }

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

  if (idVehiculo !== undefined) {
    const vehiculoNuevo = await Vehiculo.findByPk(idVehiculo);
    if (!vehiculoNuevo) throw new AppError('Vehículo no encontrado', 404);
    validarDocumentosVehiculo(vehiculoNuevo);
  }

  if (idConductor !== undefined) {
    const conductorNuevo = await Conductor.findByPk(idConductor);
    if (!conductorNuevo) throw new AppError('Conductor no encontrado', 404);
    if (conductorNuevo.vencimientoLicencia) {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const venc = new Date(conductorNuevo.vencimientoLicencia); venc.setHours(0, 0, 0, 0);
      if (venc < hoy) throw new AppError('El conductor tiene la licencia de conducción vencida y no puede ser asignado a una ruta', 400);
    }
  }

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

  const ruta = await Ruta.findByPk(id, {
    include: [
      { model: Vehiculo, as: 'vehiculo', attributes: ['idVehiculo', 'placa', 'marca', 'modelo'] },
      { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido'] }] }
    ]
  });
  if (!ruta) throw new AppError('Ruta no encontrada', 404);

  if (ruta.estado === 'Completada') {
    throw new AppError('No se puede cambiar el estado de una ruta completada', 400);
  }

  if (estado === 'Programada' && ruta.estado === 'En Curso') {
    throw new AppError('No se puede revertir el estado de una ruta en curso a Programada', 400);
  }

  if (estado === 'En Curso') {
    const rutaEnCursoVehiculo = await Ruta.findOne({
      where: { idVehiculo: ruta.idVehiculo, estado: 'En Curso', idRuta: { [Op.ne]: id }, habilitado: true }
    });
    if (rutaEnCursoVehiculo) {
      const v = ruta.vehiculo;
      throw new AppError(
        `El vehículo ${v?.placa || ''} ya está en curso en otra ruta (Ruta #${rutaEnCursoVehiculo.idRuta})`,
        409,
        [{
          tipo: 'Conflicto de vehículo',
          id: rutaEnCursoVehiculo.idRuta,
          descripcion: `${v?.placa || 'Vehículo'} ya está asignado a la Ruta #${rutaEnCursoVehiculo.idRuta} que se encuentra En Curso`
        }],
        'VEHICLE_IN_USE'
      );
    }

    const rutaEnCursoConductor = await Ruta.findOne({
      where: { idConductor: ruta.idConductor, estado: 'En Curso', idRuta: { [Op.ne]: id }, habilitado: true }
    });
    if (rutaEnCursoConductor) {
      const u = ruta.conductor?.usuario;
      throw new AppError(
        `El conductor ${u ? `${u.nombre} ${u.apellido}` : ''} ya está en curso en otra ruta (Ruta #${rutaEnCursoConductor.idRuta})`,
        409,
        [{
          tipo: 'Conflicto de conductor',
          id: rutaEnCursoConductor.idRuta,
          descripcion: `${u ? `${u.nombre} ${u.apellido}` : 'El conductor'} ya está asignado a la Ruta #${rutaEnCursoConductor.idRuta} que se encuentra En Curso`
        }],
        'CONDUCTOR_IN_USE'
      );
    }

    const encomiendaCount = await EncomiendaVenta.count({
      where: { idRuta: parseInt(id), habilitado: true }
    });
    if (encomiendaCount === 0) {
      throw new AppError('No se puede iniciar la ruta sin encomiendas asignadas. Registra al menos una encomienda antes de poner la ruta En Curso.', 400);
    }

    await Vehiculo.update({ estado: 'En Ruta' }, { where: { idVehiculo: ruta.idVehiculo } });
    await Conductor.update({ estado: 'En Ruta' }, { where: { idConductor: ruta.idConductor } });
    await AnticipoExcedente.update(
      { estado: 'En Legalización' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'Entregado' } }
    );
    await EncomiendaVenta.update(
      { estado: 'En Tránsito' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'Programada' } }
    );
  }

  if (estado === 'Completada') {
    const anticipoPendiente = await AnticipoExcedente.findOne({
      where: { idRuta: ruta.idRuta, habilitado: true, estado: 'En Legalización' },
      attributes: ['idAnticipoExcedente'],
    });
    if (anticipoPendiente) {
      throw new AppError('El conductor aún no ha registrado los gastos del anticipo. Ingresa esa información antes de completar la ruta.', 409);
    }
  }

  if ((estado === 'Completada' || estado === 'Cancelada') && ruta.estado === 'En Curso') {
    await Vehiculo.update({ estado: 'Disponible' }, { where: { idVehiculo: ruta.idVehiculo } });
    await Conductor.update({ estado: 'Disponible' }, { where: { idConductor: ruta.idConductor } });
  }

  if (estado === 'Completada') {
    await EncomiendaVenta.update(
      { estado: 'Entregada' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: 'En Tránsito' } }
    );
  }

  if (estado === 'Cancelada') {
    // Las ventas quedan pendientes de reasignación a otra ruta (no se cancelan):
    // pueden seguir su curso una vez se les asigne una ruta activa.
    await EncomiendaVenta.update(
      { estado: 'Programada' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: { [Op.in]: ['Programada', 'En Tránsito'] } } }
    );
    await AnticipoExcedente.update(
      { estado: 'Excedente pendiente' },
      { where: { idRuta: ruta.idRuta, habilitado: true, estado: { [Op.in]: ['Entregado', 'En Legalización'] } } }
    );
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
    const { bloqueado, dependencias } = await verificarDependenciasRuta(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar esta ruta porque tiene encomiendas activas',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }

  ruta.habilitado = !ruta.habilitado;
  await ruta.save();
  return ruta;
};

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await Ruta.findByPk(id, { attributes: ['idRuta', 'fechaSalida', 'horaSalida'] });
  if (!record) throw new AppError('Ruta no encontrada', 404);
  const before = await Ruta.count({
    where: {
      [Op.or]: [
        { fechaSalida: { [Op.gt]: record.fechaSalida } },
        {
          fechaSalida: record.fechaSalida,
          horaSalida: { [Op.gt]: record.horaSalida },
        },
        {
          fechaSalida: record.fechaSalida,
          horaSalida: record.horaSalida,
          idRuta: { [Op.gt]: parseInt(id) },
        },
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
  updateEstado,
  getEncomiendas,
  getAvailable,
  toggleHabilitado,
  getPageOf,
};