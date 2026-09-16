const { Op } = require('sequelize');
const { Ruta, SalidaProgramada, SalidaVehiculoConductor, EncomiendaVenta, Vehiculo, Conductor, Destino, AnticipoExcedente, Paquete, sequelize } = require('../models');

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

  const salidas = await SalidaProgramada.findAll({
    where: { habilitado: true, estado: 'En Ruta' },
    include: [
      { model: SalidaVehiculoConductor, as: 'paresVehiculoConductor', where: { idVehiculo: vehiculoId, habilitado: true }, required: true, attributes: [] },
      { model: Ruta, as: 'ruta', attributes: ['idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio', 'departamento'] }] },
    ],
    attributes: ['idSalida', 'origen', 'estado', 'fechaSalida']
  });
  salidas.forEach(s => dependencias.push({
    tipo: 'Ruta',
    id: s.idSalida,
    descripcion: `${s.origen || `Ruta #${s.idSalida}`} → ${s.ruta?.destino?.municipio || ''} (${s.estado})`
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

  const salidasEnCurso = await SalidaProgramada.findAll({
    where: { habilitado: true, estado: 'En Ruta' },
    include: [
      { model: SalidaVehiculoConductor, as: 'paresVehiculoConductor', where: { idConductor: conductorId, habilitado: true }, required: true, attributes: [] },
      { model: Ruta, as: 'ruta', attributes: ['idDestino'], include: [{ model: Destino, as: 'destino', attributes: ['municipio'] }] },
    ],
    attributes: ['idSalida', 'origen', 'fechaSalida']
  });
  salidasEnCurso.forEach(s => dependencias.push({
    tipo: 'Ruta activa',
    id: s.idSalida,
    descripcion: `${s.origen || `Ruta #${s.idSalida}`} → ${s.ruta?.destino?.municipio || ''} (En Ruta)`
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

  // idDestino ya no vive en salida_programada -- hay que pasar por su plantilla
  // (ruta.id_destino).
  const salidas = await SalidaProgramada.findAll({
    where: {
      habilitado: true,
      estado: { [Op.in]: ['Programada', 'En Ruta'] }
    },
    include: [{ model: Ruta, as: 'ruta', required: true, attributes: ['idDestino'], where: { idDestino: destinoId } }],
    attributes: ['idSalida', 'origen', 'estado', 'fechaSalida']
  });
  salidas.forEach(s => dependencias.push({
    tipo: 'Ruta',
    id: s.idSalida,
    descripcion: `${s.origen || `Ruta #${s.idSalida}`} — ${s.fechaSalida || ''} (${s.estado})`
  }));

  // "Regreso pendiente": la ida ya llegó (Completada) pero el convoy sigue fuera de
  // base y todavía no se le programó el regreso -- mismo criterio EXACTO que el
  // pseudo-estado "Regreso pendiente" del filtro de Rutas (ver
  // salidaProgramadaService.js, ESTADO_REGRESO_PENDIENTE/buildRutaWhere, y
  // LOGICA.md "Rutas — filtro 'Regreso pendiente'"). Duplicado a propósito en vez de
  // importado: salidaProgramadaService.js ya importa este archivo
  // (verificarDependenciasSalida) — importar en sentido contrario crearía un require
  // circular.
  const regresosPendientes = await SalidaProgramada.findAll({
    where: {
      habilitado: true,
      estado: 'Completada',
      idSalidaIda: null,
      idSalida: {
        [Op.notIn]: sequelize.literal('(SELECT id_salida_ida FROM salida_programada WHERE id_salida_ida IS NOT NULL)'),
        [Op.in]: sequelize.literal(
          '(SELECT svc.id_salida FROM salida_vehiculo_conductor svc ' +
          'LEFT JOIN conductor c ON c.id_conductor = svc.id_conductor ' +
          'LEFT JOIN vehiculo v ON v.id_vehiculo = svc.id_vehiculo ' +
          'WHERE svc.habilitado = true AND (c.id_destino_actual IS NOT NULL OR v.id_destino_actual IS NOT NULL))'
        ),
      },
    },
    include: [{ model: Ruta, as: 'ruta', required: true, attributes: ['idDestino'], where: { idDestino: destinoId } }],
    attributes: ['idSalida', 'origen', 'fechaSalida']
  });
  regresosPendientes.forEach(s => dependencias.push({
    tipo: 'Regreso pendiente',
    id: s.idSalida,
    descripcion: `${s.origen || `Ruta #${s.idSalida}`} — ${s.fechaSalida || ''} (convoy fuera de base, sin regreso programado)`
  }));

  return { bloqueado: dependencias.length > 0, dependencias };
};

// `idSede`, si llega, acota la consulta a las ventas registradas por esa sede
// (encomienda_venta.id_sede) — lo usa clienteService.toggleHabilitado cuando quien
// pide el toggle es 'operador_sede', para no bloquear inhabilitar un cliente por
// ventas activas de OTRA sede que ni siquiera puede ver ni gestionar (ver LOGICA.md,
// "Sedes remotas"). Sin `idSede` (admin), el comportamiento es el de siempre:
// cualquier venta activa del cliente bloquea.
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

// Reemplaza al viejo `verificarDependenciasRuta` (que miraba `encomienda_venta.id_ruta`
// contra la ruta/trip vieja) -- ahora una encomienda cuelga de una SalidaProgramada
// puntual (`id_salida`), así que esta función se llama sobre un idSalida, no sobre la
// plantilla. La plantilla (Ruta) tiene su propio chequeo, más simple, inline en
// rutaService.toggleHabilitado (solo mira si tiene salidas no terminales, no hace
// falta bajar hasta las encomiendas una por una).
const verificarDependenciasSalida = async (idSalida) => {
  // habilitado:true a propósito — una venta YA inhabilitada no debe seguir
  // bloqueando que se inhabilite su salida: en la práctica ya no está
  // operativamente asociada a ella mientras esté oculta. Ver LOGICA.md, "Ventas —
  // Cancelada e inhabilitar/habilitar".
  const encomiendas = await EncomiendaVenta.findAll({
    where: {
      idSalida,
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
  const count = await SalidaProgramada.count({
    where: { habilitado: true, estado: 'En Ruta' },
    include: [{ model: SalidaVehiculoConductor, as: 'paresVehiculoConductor', where: { idConductor: conductorId, habilitado: true }, required: true, attributes: [] }],
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

const tieneEncomiendasActivasPorSalida = async (idSalida) => {
  const { bloqueado } = await verificarDependenciasSalida(idSalida);
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
  verificarDependenciasSalida,
  verificarDependenciasAnticipo,
  tieneRutasActivas,
  tieneAnticiposPendientes,
  tieneRutasActivasPorVehiculo,
  tieneVehiculosActivosPorPropietario,
  tieneRutasActivasPorDestino,
  tieneEncomiendasActivasPorSalida,
  tieneEncomiendasActivasPorCliente
};
