const { Op } = require('sequelize');
const { Ruta, RutaVehiculoConductor, EncomiendaVenta, Vehiculo, Conductor, Destino, AnticipoExcedente, Paquete, sequelize } = require('../models');

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
  const dependencias = [];

  // Fuera de base (idDestinoActual != null): quedó varado en otro municipio tras una
  // ruta que no volvió — no tiene sentido inhabilitarlo desde ahí, el mismo criterio
  // que ya bloquea pasarlo a "Mantenimiento" (ver vehiculoService.cambiarEstado).
  const vehiculo = await Vehiculo.findByPk(vehiculoId, {
    attributes: ['idVehiculo', 'idDestinoActual'],
    include: [{ model: Destino, as: 'destinoActual', attributes: ['municipio', 'departamento'], required: false }],
  });
  if (vehiculo?.idDestinoActual) {
    dependencias.push({
      tipo: 'Fuera de base',
      id: vehiculo.idVehiculo,
      descripcion: `El vehículo está fuera de base, en ${vehiculo.destinoActual?.municipio || 'otro municipio'}`
    });
  }

  const rutas = await Ruta.findAll({
    where: { habilitado: true, estado: 'En Ruta' },
    include: [
      { model: RutaVehiculoConductor, as: 'paresVehiculoConductor', where: { idVehiculo: vehiculoId, habilitado: true }, required: true, attributes: [] },
      { model: Destino, as: 'destino', attributes: ['municipio', 'departamento'] },
    ],
    attributes: ['idRuta', 'origen', 'estado', 'fechaSalida']
  });
  rutas.forEach(r => dependencias.push({
    tipo: 'Ruta',
    id: r.idRuta,
    descripcion: `${r.origen || `Ruta #${r.idRuta}`} → ${r.destino?.municipio || ''} (${r.estado})`
  }));

  return { bloqueado: dependencias.length > 0, dependencias };
};

const verificarDependenciasConductor = async (conductorId) => {
  const dependencias = [];

  // Fuera de base (idDestinoActual != null) -- mismo criterio que en Vehículo, ver
  // verificarDependenciasVehiculo.
  const conductor = await Conductor.findByPk(conductorId, {
    attributes: ['idConductor', 'idDestinoActual'],
    include: [{ model: Destino, as: 'destinoActual', attributes: ['municipio', 'departamento'], required: false }],
  });
  if (conductor?.idDestinoActual) {
    dependencias.push({
      tipo: 'Fuera de base',
      id: conductor.idConductor,
      descripcion: `El conductor está fuera de base, en ${conductor.destinoActual?.municipio || 'otro municipio'}`
    });
  }

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
  const dependencias = [];

  const rutas = await Ruta.findAll({
    where: {
      idDestino: destinoId,
      habilitado: true,
      estado: { [Op.in]: ['Programada', 'En Ruta'] }
    },
    attributes: ['idRuta', 'origen', 'estado', 'fechaSalida']
  });
  rutas.forEach(r => dependencias.push({
    tipo: 'Ruta',
    id: r.idRuta,
    descripcion: `${r.origen || `Ruta #${r.idRuta}`} — ${r.fechaSalida || ''} (${r.estado})`
  }));

  // "Regreso pendiente": la ida ya llegó (Completada) pero el convoy sigue fuera de
  // base y todavía no se le programó el regreso -- mismo criterio EXACTO que el
  // pseudo-estado "Regreso pendiente" del filtro de Rutas (ver rutaService.js,
  // ESTADO_REGRESO_PENDIENTE/buildRutaWhere, y LOGICA.md "Rutas — filtro 'Regreso
  // pendiente'"). Duplicado a propósito en vez de importado: rutaService.js ya
  // importa este archivo (verificarDependenciasRuta) — importar en sentido
  // contrario crearía un require circular.
  const regresosPendientes = await Ruta.findAll({
    where: {
      idDestino: destinoId,
      habilitado: true,
      estado: 'Completada',
      idRutaIda: null,
      idRuta: {
        [Op.notIn]: sequelize.literal('(SELECT id_ruta_ida FROM ruta WHERE id_ruta_ida IS NOT NULL)'),
        [Op.in]: sequelize.literal(
          '(SELECT rvc.id_ruta FROM ruta_vehiculo_conductor rvc ' +
          'LEFT JOIN conductor c ON c.id_conductor = rvc.id_conductor ' +
          'LEFT JOIN vehiculo v ON v.id_vehiculo = rvc.id_vehiculo ' +
          'WHERE rvc.habilitado = true AND (c.id_destino_actual IS NOT NULL OR v.id_destino_actual IS NOT NULL))'
        ),
      },
    },
    attributes: ['idRuta', 'origen', 'fechaSalida']
  });
  regresosPendientes.forEach(r => dependencias.push({
    tipo: 'Regreso pendiente',
    id: r.idRuta,
    descripcion: `${r.origen || `Ruta #${r.idRuta}`} — ${r.fechaSalida || ''} (convoy fuera de base, sin regreso programado)`
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
