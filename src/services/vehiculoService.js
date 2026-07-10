const { Vehiculo, PropietarioVehiculo, Ruta, Conductor, Usuario, Destino } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/appError');
const { verificarDependenciasVehiculo } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['placa', 'estado', 'idVehiculo', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idVehiculo';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ estado, tipo, habilitado, q, idConductor, idPropietario, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (tipo) where.tipo = tipo;
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';
  if (idPropietario) where.idPropietario = parseInt(idPropietario);
  if (q) {
    const query = `%${q.trim()}%`;
    const numericId = Number(q);
    const conditions = [
      { placa: { [Op.iLike]: query } },
      { marca: { [Op.iLike]: query } },
      { modelo: { [Op.iLike]: query } },
      { tipo: { [Op.iLike]: query } },
      { '$propietario.nombre$': { [Op.iLike]: query } },
    ];
    if (!Number.isNaN(numericId)) {
      conditions.unshift({ idVehiculo: numericId });
    }
    where[Op.or] = conditions;
  }

  const offset = (page - 1) * limit;
  const include = [
    { model: PropietarioVehiculo, as: 'propietario' }
  ];
  const order = buildOrder(sortBy);

  const { count, rows: data } = await Vehiculo.findAndCountAll({
    where,
    include,
    limit,
    offset,
    order: order.length > 0 ? order : [['idVehiculo', 'ASC']],
    distinct: true,
  });

  return { data, total: count };
};

const getById = async (id) => {
  const vehiculo = await Vehiculo.findByPk(id, {
    include: [
      { model: PropietarioVehiculo, as: 'propietario' }
    ]
  });

  if (!vehiculo) {
    throw new AppError('Vehículo no encontrado', 404);
  }

  return vehiculo;
};

const create = async (data) => {
  const {
    idPropietario,
    placa,
    tarjetaPropiedad,
    marca,
    modelo,
    color,
    tipo,
    origen,
    capacidad,
    vencimientoSOAT,
    vencimientoRevisionTecnica,
    vencimientoSeguroTerceros
  } = data;

  const existing = await Vehiculo.findOne({ where: { placa } });
  if (existing) {
    throw new AppError('La placa ya está registrada', 400);
  }

  if (tarjetaPropiedad) {
    const existingTarjeta = await Vehiculo.findOne({ where: { tarjetaPropiedad } });
    if (existingTarjeta) {
      throw new AppError('La tarjeta de propiedad ya está registrada', 400);
    }
  }

  const vehiculoCreado = await Vehiculo.create({
    idPropietario,
    placa,
    tarjetaPropiedad,
    marca,
    modelo,
    color,
    tipo,
    origen: origen || 'Propio',
    capacidad,
    estado: 'Disponible',
    fechaRegistro: new Date(),
    vencimientoSOAT,
    vencimientoRevisionTecnica,
    vencimientoSeguroTerceros
  });

  return Vehiculo.findByPk(vehiculoCreado.idVehiculo, {
    include: [{ model: PropietarioVehiculo, as: 'propietario' }]
  });
};

const update = async (id, data) => {
  const {
    idPropietario,
    placa,
    tarjetaPropiedad,
    marca,
    modelo,
    color,
    tipo,
    origen,
    capacidad,
    estado,
    vencimientoSOAT,
    vencimientoRevisionTecnica,
    vencimientoSeguroTerceros,
    habilitado
  } = data;

  const vehiculo = await Vehiculo.findByPk(id);

  if (!vehiculo) {
    throw new AppError('Vehículo no encontrado', 404);
  }

  if (placa && placa !== vehiculo.placa) {
    const existing = await Vehiculo.findOne({ where: { placa } });
    if (existing) {
      throw new AppError('La placa ya está registrada', 400);
    }
  }

  if (tarjetaPropiedad && tarjetaPropiedad !== vehiculo.tarjetaPropiedad) {
    const existingTarjeta = await Vehiculo.findOne({
      where: { tarjetaPropiedad, idVehiculo: { [Op.ne]: id } },
    });
    if (existingTarjeta) {
      throw new AppError('La tarjeta de propiedad ya está registrada', 400);
    }
  }

  await vehiculo.update({
    idPropietario: idPropietario || vehiculo.idPropietario,
    placa: placa || vehiculo.placa,
    tarjetaPropiedad: tarjetaPropiedad !== undefined ? tarjetaPropiedad : vehiculo.tarjetaPropiedad,
    marca: marca !== undefined ? marca : vehiculo.marca,
    modelo: modelo !== undefined ? modelo : vehiculo.modelo,
    color: color !== undefined ? color : vehiculo.color,
    tipo: tipo !== undefined ? tipo : vehiculo.tipo,
    origen: origen !== undefined ? origen : vehiculo.origen,
    capacidad: capacidad !== undefined ? capacidad : vehiculo.capacidad,
    estado: estado || vehiculo.estado,
    vencimientoSOAT: vencimientoSOAT !== undefined ? vencimientoSOAT : vehiculo.vencimientoSOAT,
    vencimientoRevisionTecnica: vencimientoRevisionTecnica !== undefined ? vencimientoRevisionTecnica : vehiculo.vencimientoRevisionTecnica,
    vencimientoSeguroTerceros: vencimientoSeguroTerceros !== undefined ? vencimientoSeguroTerceros : vehiculo.vencimientoSeguroTerceros,
    habilitado: habilitado !== undefined ? habilitado : vehiculo.habilitado
  });

  return Vehiculo.findByPk(id, {
    include: [{ model: PropietarioVehiculo, as: 'propietario' }]
  });
};


const getRutas = async (id) => {
  const vehiculo = await Vehiculo.findByPk(id);
  if (!vehiculo) {
    throw new AppError('Vehículo no encontrado', 404);
  }

  const rutas = await Ruta.findAll({
    where: { idVehiculo: id },
    include: [
      { model: Conductor, as: 'conductor' },
      { model: Destino, as: 'destino' }
    ]
  });

  return rutas;
};

const cambiarEstado = async (id, estado) => {
  const ESTADOS_VALIDOS = ['Disponible', 'Mantenimiento'];

  if (!estado) {
    throw new AppError('El campo "estado" es requerido', 400);
  }

  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new AppError(`Estado inválido. Los estados permitidos son: ${ESTADOS_VALIDOS.join(', ')}`, 400);
  }

  const vehiculo = await Vehiculo.findByPk(id);

  if (!vehiculo) {
    throw new AppError('Vehículo no encontrado', 404);
  }

  if (!vehiculo.habilitado) {
    throw new AppError('No se puede cambiar el estado de un vehículo deshabilitado', 400);
  }

  const estadoAnterior = vehiculo.estado;
  await vehiculo.update({ estado });

  return {
    idVehiculo: vehiculo.idVehiculo,
    placa: vehiculo.placa,
    estadoAnterior,
    estadoActual: estado
  };
};

const toggleHabilitado = async (id) => {
  const vehiculo = await Vehiculo.findByPk(id);
  if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);
  if (vehiculo.habilitado === true) {
    const { bloqueado, dependencias } = await verificarDependenciasVehiculo(id);
    if (bloqueado) {
      throw new AppError(
        'No se puede inhabilitar este vehículo porque tiene rutas activas asignadas',
        409,
        dependencias,
        'DEPENDENCY_CONFLICT'
      );
    }
  }
  vehiculo.habilitado = !vehiculo.habilitado;
  await vehiculo.save();
  return vehiculo;
};

const getPageOf = async (id, { limit = 10 } = {}) => {
  const record = await Vehiculo.findByPk(id, { attributes: ['idVehiculo', 'placa'] });
  if (!record) throw new AppError('Vehículo no encontrado', 404);
  // La lista ordena por placa ASC; para igual placa tiebreaker idVehiculo ASC
  const before = await Vehiculo.count({
    where: {
      [Op.or]: [
        { placa: { [Op.lt]: record.placa } },
        { placa: record.placa, idVehiculo: { [Op.lt]: parseInt(id) } },
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
  getRutas,
  cambiarEstado,
  toggleHabilitado,
  getPageOf,
};