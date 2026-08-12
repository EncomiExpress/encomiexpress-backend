const ESTADOS_PAQUETE = ['Por entregar', 'En reparto', 'Entregado', 'Devuelto'];

const ESTADO_ALIASES = {
  'por entregar': 'Por entregar',
  'porentregar': 'Por entregar',
  'por_entregar': 'Por entregar',
  'en reparto': 'En reparto',
  'en_reparto': 'En reparto',
  'entregado': 'Entregado',
  'devuelto a bodega': 'Devuelto',
  'devuelto_a_bodega': 'Devuelto',
  'devuelto': 'Devuelto',
};

const normalizarEstadoPaquete = (estado) => {
  if (!estado || typeof estado !== 'string') {
    throw new Error('El estado del paquete es obligatorio');
  }

  const clave = estado.trim().toLowerCase();
  const normalizado = ESTADO_ALIASES[clave] || estado.trim();

  if (!ESTADOS_PAQUETE.includes(normalizado)) {
    throw new Error(`Estado inválido para paquete. Opciones: ${ESTADOS_PAQUETE.join(', ')}`);
  }

  return normalizado;
};

const construirHistorialEstado = (historialActual = [], nuevoEstado, accion, observacion = '') => {
  const estadoNormalizado = normalizarEstadoPaquete(nuevoEstado);
  const entrada = {
    estado: estadoNormalizado,
    accion: accion || 'Actualización de estado',
    observacion: observacion || '',
    fecha: new Date().toISOString(),
  };

  return [...(Array.isArray(historialActual) ? historialActual : []), entrada];
};

const determinarEstadoEncomienda = (paquetes = []) => {
  if (!Array.isArray(paquetes) || paquetes.length === 0) {
    return 'Programada';
  }

  const estados = paquetes.map((pkg) => normalizarEstadoPaquete(pkg?.estado || 'Por entregar'));

  // Terminal = ya no requiere más acción del conductor (se entregó o se devolvió a
  // bodega). Si TODOS los paquetes llegaron a un estado terminal, la venta ya
  // terminó su proceso — "Entregada" si todos se entregaron, o "Completada con
  // novedades" si al menos uno quedó devuelto en bodega.
  const todosTerminados = estados.every((estado) => estado === 'Entregado' || estado === 'Devuelto');
  if (todosTerminados) {
    return estados.some((estado) => estado === 'Devuelto') ? 'Completada con novedades' : 'Entregada';
  }
  if (estados.some((estado) => estado === 'En reparto' || estado === 'Devuelto')) {
    return 'En Ruta';
  }
  return 'Programada';
};

module.exports = {
  ESTADOS_PAQUETE,
  normalizarEstadoPaquete,
  construirHistorialEstado,
  determinarEstadoEncomienda,
};
