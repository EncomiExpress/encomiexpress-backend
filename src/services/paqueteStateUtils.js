const AppError = require('../errors/appError');

// "En sede de destino" es el estado intermedio de un paquete que el conductor del
// tramo troncal ya dejó en la sede de su municipio, a la espera de que el
// distribuidor de esa sede registre la entrega final — ver
// encomiendaService.registrarEntregaFinal. No es terminal: determinarEstadoEncomienda
// de abajo lo trata igual que "Por entregar" (la venta no se cierra hasta que el
// paquete llegue a Entregado/Devuelto).
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

// "Por entregar" es el ÚNICO estado en el que el conductor del tramo troncal
// todavía tiene algo pendiente con el paquete. En cuanto lo deja "En sede de
// destino" (o alguien lo cierra en Entregado/Devuelto), su parte terminó: la ruta
// ya puede completarse y la entrega final al destinatario corre por cuenta del
// distribuidor de la sede, con la ruta ya cerrada. Ver LOGICA.md, "Entrega en dos
// fases", y el uso en rutaService (PACKAGES_PENDING / paquetesPendientes).
const paqueteLiberaRuta = (estado) =>
  normalizarEstadoPaquete(estado || 'Por entregar') !== 'Por entregar';

// Indicador "X de N sedes completadas" de una ruta. `sedesRuta` = todos los
// municipios estructurales del recorrido (paradas + destino final, sin duplicar);
// `sedesConPendiente` = los municipios que todavía tienen algún paquete "Por
// entregar". Una sede está "completada" cuando NO tiene ningún paquete pendiente
// — incluidas las paradas sin carga (nada que hacer -> completada de entrada).
// `total` = todas las sedes del recorrido, para que el número refleje la
// estructura de la ruta y no solo dónde hay carga (decisión de la usuaria). Se
// ignoran los ids null/undefined. Lo usa rutaService para el listado y el
// auto-completado. Ver LOGICA.md, "Entrega en dos fases".
const resumenSedes = (sedesRuta = [], sedesConPendiente = []) => {
  const todas = [...new Set((sedesRuta || []).filter((id) => id !== null && id !== undefined))];
  const pendientes = new Set((sedesConPendiente || []).filter((id) => id !== null && id !== undefined));
  const completadas = todas.filter((id) => !pendientes.has(id)).length;
  return { total: todas.length, completadas };
};

// Terminal = ya no requiere más acción de nadie (se entregó al destinatario o
// quedó como no-entregado). "En sede de destino" NO es terminal a propósito: la
// venta no se cierra hasta que el distribuidor resuelve la entrega final — así el
// pago Contraentrega tampoco se puede confirmar antes de tiempo.
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
  paqueteLiberaRuta,
  resumenSedes,
  determinarEstadoEncomienda,
};
