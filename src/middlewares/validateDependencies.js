const { Op } = require('sequelize');
const { Ruta, RutaVehiculoConductor, EncomiendaVenta, Vehiculo, Destino, AnticipoExcedente, Paquete } = require('../models');

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
    where: { habilitado: true, estado: 'En Ruta' },
    include: [
      { model: RutaVehiculoConductor, as: 'paresVehiculoConductor', where: { idVehiculo: vehiculoId, habilitado: true }, required: true, attributes: [] },
      { model: Destino, as: 'destino', attributes: ['municipio', 'departamento'] },
    ],
    attributes: ['idRuta', 'origen', 'estado', 'fechaSalida']
  });
  const dependencias = rutas.map(r => ({
    tipo: 'Ruta',
    id: r.idRuta,
    descripcion: `${r.origen || `Ruta #${r.idRuta}`} → ${r.destino?.municipio || ''} (${r.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasConductor = async (conductorId) => {
  const dependencias = [];

  const rutasEnCurso = await Ruta.findAll({
    where: { habilitado: true, estado: 'En Ruta' },
    include: [
      { model: RutaVehiculoConductor, as: 'paresVehiculoConductor', where: { idConductor: conductorId, habilitado: true }, required: true, attributes: [] },
      { model: Destino, as: 'destino', attributes: ['municipio'] },
    ],
    attributes: ['idRuta', 'origen', 'fechaSalida']
  });
  rutasEnCurso.forEach(r => dependencias.push({
    tipo: 'Ruta activa',
    id: r.idRuta,
    descripcion: `${r.origen || `Ruta #${r.idRuta}`} → ${r.destino?.municipio || ''} (En Ruta)`
  }));

  const anticiposPendientes = await AnticipoExcedente.findAll({
    where: { idConductor: conductorId, estado: { [Op.in]: ['Entregado', 'En Legalización', 'Excedente pendiente'] }, habilitado: true },
    attributes: ['idAnticipoExcedente', 'valorAnticipo', 'fechaEntrega']
  });
  anticiposPendientes.forEach(a => dependencias.push({
    tipo: 'Anticipo Pendiente',
    id: a.idAnticipoExcedente,
    descripcion: `Anticipo del ${a.fechaEntrega || 'sin fecha'} — $${a.valorAnticipo} (pendiente de legalización)`
  }));

  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasDestino = async (destinoId) => {
  const rutas = await Ruta.findAll({
    where: {
      idDestino: destinoId,
      habilitado: true,
      estado: { [Op.in]: ['Programada', 'En Ruta'] }
    },
    attributes: ['idRuta', 'origen', 'estado', 'fechaSalida']
  });
  const dependencias = rutas.map(r => ({
    tipo: 'Ruta',
    id: r.idRuta,
    descripcion: `${r.origen || `Ruta #${r.idRuta}`} — ${r.fechaSalida || ''} (${r.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

// `idSede`, si llega, acota la consulta a las ventas registradas por esa sede
// (encomienda_venta.id_sede) — lo usa clienteService.toggleHabilitado cuando
// quien pide el toggle es 'operador_sede', para no bloquear inhabilitar un
// cliente por ventas activas de OTRA sede que ni siquiera puede ver ni
// gestionar (ver LOGICA.md, "Sedes remotas"). Sin `idSede` (admin), el
// comportamiento es el de siempre: cualquier venta activa del cliente bloquea.
const verificarDependenciasCliente = async (clienteId, { idSede } = {}) => {
  const where = {
    idCliente: clienteId,
    estado: { [Op.notIn]: ['Entregada', 'Completada con novedades', 'Cancelada'] }
  };
  if (idSede !== undefined) where.idSede = idSede;

  const encomiendas = await EncomiendaVenta.findAll({
    where,
    attributes: ['idEncomiendaVenta', 'estado'],
    include: [{ model: Paquete, as: 'paquetes', attributes: ['numeroGuia'], required: false, limit: 1 }]
  });
  const dependencias = encomiendas.map(e => ({
    tipo: 'Encomienda',
    id: e.idEncomiendaVenta,
    descripcion: `Guía ${e.paquetes?.[0]?.numeroGuia || '#' + e.idEncomiendaVenta} (${e.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasRuta = async (rutaId) => {
  // habilitado:true a propósito — una venta YA inhabilitada no debe seguir bloqueando
  // que se inhabilite su ruta: en la práctica ya no está operativamente asociada a
  // ella mientras esté oculta. Si más adelante alguien la rehabilita, ahí entra el
  // mecanismo de encomiendaService.toggleHabilitado()/rutaSigueSirviendo() (ver
  // LOGICA.md, "Ventas — Cancelada e inhabilitar/habilitar") — la deja Cancelada si
  // la ruta ya no sirve (incluida una ruta inhabilitada por este mismo camino), en vez
  // de revivirla apuntando a algo que ya no es válido.
  const encomiendas = await EncomiendaVenta.findAll({
    where: {
      idRuta: rutaId,
      habilitado: true,
      estado: { [Op.notIn]: ['Entregada', 'Completada con novedades', 'Cancelada'] }
    },
    attributes: ['idEncomiendaVenta', 'estado'],
    include: [{ model: Paquete, as: 'paquetes', attributes: ['numeroGuia'], required: false, limit: 1 }]
  });
  const dependencias = encomiendas.map(e => ({
    tipo: 'Encomienda',
    id: e.idEncomiendaVenta,
    descripcion: `Guía ${e.paquetes?.[0]?.numeroGuia || '#' + e.idEncomiendaVenta} (${e.estado})`
  }));
  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasAnticipo = async (anticipoId) => {
  const anticipo = await AnticipoExcedente.findByPk(anticipoId, {
    attributes: ['idAnticipoExcedente', 'estado', 'valorAnticipo', 'fechaEntrega']
  });
  if (!anticipo || !['Entregado', 'En Legalización', 'Excedente pendiente'].includes(anticipo.estado)) return { bloqueado: false, dependencias: [] };
  return {
    bloqueado: true,
    dependencias: [{
      tipo: 'Estado del anticipo',
      id: anticipo.idAnticipoExcedente,
      descripcion: `El anticipo del ${anticipo.fechaEntrega || 'sin fecha'}, por $${anticipo.valorAnticipo}, aún no ha sido legalizado`
    }]
  };
};

// ─── Aliases booleanos (compatibilidad con código existente) ──────────────────

const tieneRutasActivas = async (conductorId) => {
  const count = await Ruta.count({
    where: { habilitado: true, estado: 'En Ruta' },
    include: [{ model: RutaVehiculoConductor, as: 'paresVehiculoConductor', where: { idConductor: conductorId, habilitado: true }, required: true, attributes: [] }],
  });
  return count > 0;
};

const tieneAnticiposPendientes = async (conductorId) => {
  const count = await AnticipoExcedente.count({ where: { idConductor: conductorId, estado: { [Op.in]: ['Entregado', 'En Legalización', 'Excedente pendiente'] }, habilitado: true } });
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
  tieneAnticiposPendientes,
  tieneRutasActivasPorVehiculo,
  tieneVehiculosActivosPorPropietario,
  tieneRutasActivasPorDestino,
  tieneEncomiendasActivasPorRuta,
  tieneEncomiendasActivasPorCliente
};
