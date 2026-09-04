const AppError = require('../errors/appError');

// "En sede de destino" es el estado intermedio de un paquete que el conductor del
// tramo troncal ya dejó en la sede de su municipio, a la espera (o ya con) un
// repartidor local asignado (idConductorEntrega en Paquete) para la entrega puerta
// a puerta — ver encomiendaService.actualizarEstadoPaquete/asignarRepartidorLocal.
// No es terminal: determinarEstadoEncomienda de abajo lo trata igual que "Por
// entregar" (la venta no se cierra hasta que el paquete llegue a Entregado/Devuelto).
const ESTADOS_PAQUETE = ['Por entregar', 'En sede de destino', 'Entregado', 'Devuelto'];

const ESTADO_ALIASES = {
  'por entregar': 'Por entregar',
  'porentregar': 'Por entregar',
  'por_entregar': 'Por entregar',
  'en sede de destino': 'En sede de destino',
  'en_sede_de_destino': 'En sede de destino',
  'en sede': 'En sede de destino',
  'entregado': 'Entregado',
  'devuelto': 'Devuelto',
};

const normalizarEstadoPaquete = (estado) => {
  if (!estado || typeof estado !== 'string') {
    throw new AppError('El estado del paquete es obligatorio', 400);
  }

  const clave = estado.trim().toLowerCase();
  const normalizado = ESTADO_ALIASES[clave] || estado.trim();

  if (!ESTADOS_PAQUETE.includes(normalizado)) {
    throw new AppError(`Estado inválido para paquete. Opciones: ${ESTADOS_PAQUETE.join(', ')}`, 400);
  }

  return normalizado;
};

// Terminal = ya no requiere más acción del conductor (se entregó o se devolvió).
// Si no hay paquetes o todavía falta alguno por marcar, la venta se queda en el
// estado que ya tenía — quien la mueve a "En Ruta" es rutaService.updateEstado,
// no este cálculo. Solo cuando TODOS los paquetes llegan a un estado terminal se
// decide el cierre: "Entregada" si todos se entregaron, "Completada con
// novedades" si al menos uno quedó devuelto.
const determinarEstadoEncomienda = (paquetes = [], estadoActual) => {
  if (!Array.isArray(paquetes) || paquetes.length === 0) {
    return estadoActual;
  }

  const estados = paquetes.map((pkg) => normalizarEstadoPaquete(pkg?.estado || 'Por entregar'));

  const todosTerminados = estados.every((estado) => estado === 'Entregado' || estado === 'Devuelto');
  if (todosTerminados) {
    return estados.some((estado) => estado === 'Devuelto') ? 'Completada con novedades' : 'Entregada';
  }

  return estadoActual;
};

module.exports = {
  ESTADOS_PAQUETE,
  normalizarEstadoPaquete,
  determinarEstadoEncomienda,
};
