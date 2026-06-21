const { Op } = require('sequelize');
const { Ruta, EncomiendaVenta, Vehiculo, Conductor, PropietarioVehiculo, Destino, AnticipoExcedente, Usuario } = require('../models');

// ─── Funciones detalladas (devuelven { bloqueado, dependencias[] }) ────────────

const verificarDependenciasPropietario = async (propietarioId) => {
  const vehiculos = await Vehiculo.findAll({
    where: { idPropietario: propietarioId, habilitado: true },
    attributes: ['idVehiculo', 'placa', 'marca', 'modelo', 'estado']
  });
  const dependencias = vehiculos.map(v => ({
    tipo: 'Vehículo',
    id: v.idVehiculo,
    descripcion: `Placa ${v.placa} — ${v.marca} ${v.modelo} (${v.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasVehiculo = async (vehiculoId) => {
  const rutas = await Ruta.findAll({
    where: {
      idVehiculo: vehiculoId,
      habilitado: true,
      estado: { [Op.in]: ['Programada', 'En Curso'] }
    },
    include: [{ model: Destino, as: 'destino', attributes: ['ciudad', 'departamento'] }],
    attributes: ['idRuta', 'nombreRuta', 'estado', 'fechaSalida']
  });
  const dependencias = rutas.map(r => ({
    tipo: 'Ruta',
    id: r.idRuta,
    descripcion: `${r.nombreRuta || `Ruta #${r.idRuta}`} → ${r.destino?.ciudad || ''} (${r.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasConductor = async (conductorId) => {
  const dependencias = [];

  const rutasEnCurso = await Ruta.findAll({
    where: { idConductor: conductorId, habilitado: true, estado: 'En Curso' },
    include: [{ model: Destino, as: 'destino', attributes: ['ciudad'] }],
    attributes: ['idRuta', 'nombreRuta', 'fechaSalida']
  });
  rutasEnCurso.forEach(r => dependencias.push({
    tipo: 'Ruta En Curso',
    id: r.idRuta,
    descripcion: `${r.nombreRuta || `Ruta #${r.idRuta}`} → ${r.destino?.ciudad || ''} (En Curso)`
  }));

  const anticiposPendientes = await AnticipoExcedente.findAll({
    where: { idConductor: conductorId, estado: 'pendiente', habilitado: true },
    attributes: ['idAnticipoExcedente', 'valorAnticipo', 'fechaEntrega']
  });
  anticiposPendientes.forEach(a => dependencias.push({
    tipo: 'Anticipo Pendiente',
    id: a.idAnticipoExcedente,
    descripcion: `Anticipo #${a.idAnticipoExcedente} — $${a.valorAnticipo} (pendiente de legalización)`
  }));

  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasDestino = async (destinoId) => {
  const rutas = await Ruta.findAll({
    where: {
      idDestino: destinoId,
      habilitado: true,
      estado: { [Op.in]: ['Programada', 'En Curso'] }
    },
    attributes: ['idRuta', 'nombreRuta', 'estado', 'fechaSalida']
  });
  const dependencias = rutas.map(r => ({
    tipo: 'Ruta',
    id: r.idRuta,
    descripcion: `${r.nombreRuta || `Ruta #${r.idRuta}`} — ${r.fechaSalida || ''} (${r.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasCliente = async (clienteId) => {
  const encomiendas = await EncomiendaVenta.findAll({
    where: {
      idCliente: clienteId,
      estado: { [Op.notIn]: ['entregado', 'devuelto'] }
    },
    attributes: ['idEncomiendaVenta', 'numeroGuia', 'estado']
  });
  const dependencias = encomiendas.map(e => ({
    tipo: 'Encomienda',
    id: e.idEncomiendaVenta,
    descripcion: `Guía ${e.numeroGuia} (${e.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasRuta = async (rutaId) => {
  const encomiendas = await EncomiendaVenta.findAll({
    where: {
      idRuta: rutaId,
      estado: { [Op.notIn]: ['entregado', 'devuelto'] }
    },
    attributes: ['idEncomiendaVenta', 'numeroGuia', 'estado']
  });
  const dependencias = encomiendas.map(e => ({
    tipo: 'Encomienda',
    id: e.idEncomiendaVenta,
    descripcion: `Guía ${e.numeroGuia} (${e.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasAnticipo = async (anticipoId) => {
  const anticipo = await AnticipoExcedente.findByPk(anticipoId, {
    attributes: ['idAnticipoExcedente', 'estado', 'valorAnticipo']
  });
  if (!anticipo || anticipo.estado !== 'pendiente') return { bloqueado: false, dependencias: [] };
  return {
    bloqueado: true,
    dependencias: [{
      tipo: 'Estado del anticipo',
      id: anticipo.idAnticipoExcedente,
      descripcion: `Anticipo #${anticipo.idAnticipoExcedente} con valor $${anticipo.valorAnticipo} aún no ha sido legalizado`
    }]
  };
};

// ─── Aliases booleanos (compatibilidad con código existente) ──────────────────

const tieneRutasActivas = async (conductorId) => {
  const count = await Ruta.count({ where: { idConductor: conductorId, habilitado: true, estado: 'En Curso' } });
  return count > 0;
};

const tieneVehiculosActivos = async (conductorId) => {
  const count = await Vehiculo.count({ where: { idConductor: conductorId, habilitado: true } });
  return count > 0;
};

const tieneAnticiposPendientes = async (conductorId) => {
  const count = await AnticipoExcedente.count({ where: { idConductor: conductorId, estado: 'pendiente', habilitado: true } });
  return count > 0;
};

const tieneRutasActivasPorVehiculo = async (vehiculoId) => {
  const { bloqueado } = await verificarDependenciasVehiculo(vehiculoId);
  return bloqueado;
};

const tieneVehiculosActivosPorPropietario = async (propietarioId) => {
  const { bloqueado } = await verificarDependenciasPropietario(propietarioId);
  return bloqueado;
};

const tieneRutasActivasPorDestino = async (destinoId) => {
  const { bloqueado } = await verificarDependenciasDestino(destinoId);
  return bloqueado;
};

const tieneEncomiendasActivasPorRuta = async (rutaId) => {
  const { bloqueado } = await verificarDependenciasRuta(rutaId);
  return bloqueado;
};

const tieneEncomiendasActivasPorCliente = async (clienteId) => {
  const { bloqueado } = await verificarDependenciasCliente(clienteId);
  return bloqueado;
};

module.exports = {
  verificarDependenciasPropietario,
  verificarDependenciasVehiculo,
  verificarDependenciasConductor,
  verificarDependenciasDestino,
  verificarDependenciasCliente,
  verificarDependenciasRuta,
  verificarDependenciasAnticipo,
  tieneRutasActivas,
  tieneVehiculosActivos,
  tieneAnticiposPendientes,
  tieneRutasActivasPorVehiculo,
  tieneVehiculosActivosPorPropietario,
  tieneRutasActivasPorDestino,
  tieneEncomiendasActivasPorRuta,
  tieneEncomiendasActivasPorCliente
};
