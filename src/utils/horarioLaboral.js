// Horario de SALIDA de las rutas (despacho). Los vehículos se despachan de noche, una
// vez organizada la carga que se recibió en la oficina durante el día (dato del
// cliente) — por eso la hora de salida de una SalidaProgramada solo puede ser nocturna.
// Índice = Date.prototype.getDay() (0 = domingo: la empresa permanece cerrada).
// DEBE coincidir con encomiexpress-frontend/src/shared/utils/horarioLaboral.js
//
// Cada rango tiene que caber dentro de UN solo día (min < max): SelectorHora, en el
// frontend, no maneja rangos que cruzan la medianoche (ej. 19:00 → 05:00).
//
// El horario de recepción de paquetes en la oficina (lunes a viernes 08:00–19:00,
// sábados 08:00–15:00, también dato del cliente) NO se valida en ningún lado — no
// forma parte de esta tabla. La hora estimada de LLEGADA tampoco tiene ventana: un
// despacho de noche llega de madrugada o esa misma noche.
const HORARIO_SALIDA = {
  0: null,
  1: { min: '19:00', max: '23:59' },
  2: { min: '19:00', max: '23:59' },
  3: { min: '19:00', max: '23:59' },
  4: { min: '19:00', max: '23:59' },
  5: { min: '19:00', max: '23:59' },
  6: { min: '19:00', max: '23:59' },
};

const MIN_DIAS_SALIDA_LLEGADA = 0;

// Margen mínimo entre el final de una ruta y el inicio de la siguiente, para el mismo
// vehículo/conductor — cubre descargar, revisar el vehículo y que el conductor
// descanse antes de volver a salir. Concepto distinto de MIN_DIAS_SALIDA_LLEGADA (ese
// es sobre la duración mínima de UNA sola ruta, este es sobre el espacio entre dos
// rutas distintas) — antes compartían el mismo valor por simplicidad, ahora que hay
// fecha de llegada real se separan: la usuaria pidió reducir solo este margen a 1 día.
const DIAS_MARGEN_ENTRE_RUTAS = 1;

// Horizonte máximo de programación: rutas son recorridos regionales cortos, no tiene
// sentido dejar programar una salida o llegada con meses/años de anticipación.
const MAX_DIAS_ANTICIPACION = 90;

const parseFechaLocal = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getRangoSalida = (iso) => (iso ? HORARIO_SALIDA[parseFechaLocal(iso).getDay()] || null : null);

const esDomingo = (iso) => !!iso && parseFechaLocal(iso).getDay() === 0;

// ¿La hora de salida cae en la ventana nocturna del día? (sin fecha u hora no hay nada
// que validar; en domingo nunca — no hay ventana)
const horaSalidaValida = (iso, horaStr) => {
  if (!iso || !horaStr) return true;
  const rango = getRangoSalida(iso);
  if (!rango) return false;
  const hora = horaStr.slice(0, 5);
  return hora >= rango.min && hora <= rango.max;
};

module.exports = { HORARIO_SALIDA, MIN_DIAS_SALIDA_LLEGADA, DIAS_MARGEN_ENTRE_RUTAS, MAX_DIAS_ANTICIPACION, getRangoSalida, esDomingo, horaSalidaValida };
