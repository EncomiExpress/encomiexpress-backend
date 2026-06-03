const { Vehiculo, Conductor, PropietarioVehiculo, Ruta, Usuario, Destino } = require('../models');
const AppError = require('../errors/appError');
const { tieneRutasActivasPorVehiculo } = require('../middlewares/validateDependencies');

const buildOrder = (sortBy) => {
  if (!sortBy) return [];
  const allowed = ['placa', 'estado', 'idVehiculo', 'habilitado'];
  const parts = sortBy.split('.');
  const field = allowed.includes(parts[0]) ? parts[0] : 'idVehiculo';
  const direction = parts[1] === 'desc' ? 'DESC' : 'ASC';
  return [[field, direction]];
};

const getAll = async ({ estado, habilitado, page = 1, limit = 10, sortBy } = {}) => {
  const where = {};
  if (estado) where.estado = estado;
  if (habilitado !== undefined) where.habilitado = habilitado === 'true';

  const offset = (page - 1) * limit;
  const include = [
    { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
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
      { model: Conductor, as: 'conductor', include: [{ model: Usuario, as: 'usuario' }] },
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
    idConductor,
    idPropietario,
    placa,
    marca,
    modelo,
    color,
    tipo,
    capacidad,
    vencimientoSOAT,
    vencimientoRevisionTecnica,
    vencimientoSeguroTerceros
  } = data;

  const existing = await Vehiculo.findOne({ where: { placa } });
  if (existing) {
    throw new AppError('La placa ya está registrada', 400);
  }

  const vehiculo = await Vehiculo.create({
    idConductor,
    idPropietario,
    placa,
    marca,
    modelo,
    color,
    tipo,
    capacidad,
    estado: 'disponible',
    fechaRegistro: new Date(),
    vencimientoSOAT,
    vencimientoRevisionTecnica,
    vencimientoSeguroTerceros
  });

  return vehiculo;
};

const update = async (id, data) => {
  const {
    idConductor,
    idPropietario,
    placa,
    marca,
    modelo,
    color,
    tipo,
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

  await vehiculo.update({
    idConductor: idConductor || vehiculo.idConductor,
    idPropietario: idPropietario || vehiculo.idPropietario,
    placa: placa || vehiculo.placa,
    marca: marca !== undefined ? marca : vehiculo.marca,
    modelo: modelo !== undefined ? modelo : vehiculo.modelo,
    color: color !== undefined ? color : vehiculo.color,
    tipo: tipo !== undefined ? tipo : vehiculo.tipo,
    capacidad: capacidad !== undefined ? capacidad : vehiculo.capacidad,
    estado: estado || vehiculo.estado,
    vencimientoSOAT: vencimientoSOAT !== undefined ? vencimientoSOAT : vehiculo.vencimientoSOAT,
    vencimientoRevisionTecnica: vencimientoRevisionTecnica !== undefined ? vencimientoRevisionTecnica : vehiculo.vencimientoRevisionTecnica,
    vencimientoSeguroTerceros: vencimientoSeguroTerceros !== undefined ? vencimientoSeguroTerceros : vehiculo.vencimientoSeguroTerceros,
    habilitado: habilitado !== undefined ? habilitado : vehiculo.habilitado
  });

  return vehiculo;
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
  const ESTADOS_VALIDOS = ['disponible', 'ocupado', 'en reparacion'];

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

const assignDriver = async (id, idConductor) => {
  const vehiculo = await Vehiculo.findByPk(id);

  if (!vehiculo) {
    throw new AppError('Vehículo no encontrado', 404);
  }

  const conductor = await Conductor.findByPk(idConductor);
  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  await vehiculo.update({ idConductor });

  return vehiculo;
};

const toggleHabilitado = async (id) => {
  const vehiculo = await Vehiculo.findByPk(id);
  if (!vehiculo) throw new AppError('Vehículo no encontrado', 404);
  if (vehiculo.habilitado === true) {
    const rutasActivas = await tieneRutasActivasPorVehiculo(id);
    if (rutasActivas) throw new AppError('No se puede inhabilitar un vehículo con rutas activas', 400);
  }
  vehiculo.habilitado = !vehiculo.habilitado;
  await vehiculo.save();

  // Sincronizar estado del propietario: si ya no tiene vehículos habilitados, inhabilitar propietario.
  try {
    const idPropietario = vehiculo.idPropietario;
    if (idPropietario) {
      const vehiculosActivosCount = await Vehiculo.count({ where: { idPropietario, habilitado: true } });
      const propietario = await PropietarioVehiculo.findByPk(idPropietario);
      if (propietario) {
        if (vehiculosActivosCount === 0 && propietario.habilitado) {
          propietario.habilitado = false;
          await propietario.save();
        } else if (vehiculosActivosCount > 0 && !propietario.habilitado) {
          propietario.habilitado = true;
          await propietario.save();
        }
      }
    }
  } catch (err) {
    // No bloquear la operación por errores secundarios de sincronización
    console.error('Error sincronizando propietario tras toggle vehículo:', err.message || err);
  }

  return vehiculo;
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  getRutas,
  cambiarEstado,
  assignDriver,
  toggleHabilitado
};