const ESTADOS_PAQUETE = ['Por entregar', 'En reparto', 'Entregado', 'No entregado', 'Devuelto a bodega'];

const ESTADO_ALIASES = {
  'por entregar': 'Por entregar',
  'porentregar': 'Por entregar',
  'por_entregar': 'Por entregar',
  'en reparto': 'En reparto',
  'en_reparto': 'En reparto',
  'entregado': 'Entregado',
  'no entregado': 'No entregado',
  'no_entregado': 'No entregado',
  'devuelto a bodega': 'Devuelto a bodega',
  'devuelto_a_bodega': 'Devuelto a bodega',
  'devuelto': 'Devuelto a bodega',
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
  if (estados.every((estado) => estado === 'Entregado')) {
    return 'Entregada';
  }
  if (estados.some((estado) => estado === 'En reparto' || estado === 'No entregado' || estado === 'Devuelto a bodega')) {
    return 'En Tránsito';
  }
  return 'Programada';
};

module.exports = {
  ESTADOS_PAQUETE,
  normalizarEstadoPaquete,
  construirHistorialEstado,
  determinarEstadoEncomienda,
};
