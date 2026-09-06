// Horario laboral de la empresa. Índice = Date.prototype.getDay() (0 = domingo).
// DEBE coincidir con encomiexpress-frontend/src/shared/utils/horarioLaboral.js
const HORARIO_LABORAL = {
  0: null,
  1: { min: '07:00', max: '19:00' },
  2: { min: '07:00', max: '19:00' },
  3: { min: '07:00', max: '19:00' },
  4: { min: '07:00', max: '19:00' },
  5: { min: '07:00', max: '19:00' },
  6: { min: '08:00', max: '15:00' },
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

const getRangoHorario = (iso) => (iso ? HORARIO_LABORAL[parseFechaLocal(iso).getDay()] || null : null);

const esDomingo = (iso) => !!iso && parseFechaLocal(iso).getDay() === 0;

const horaDentroDeRango = (iso, horaStr) => {
  if (!iso || !horaStr) return true;
  const rango = getRangoHorario(iso);
  if (!rango) return false;
  const hora = horaStr.slice(0, 5);
  return hora >= rango.min && hora <= rango.max;
};

module.exports = { HORARIO_LABORAL, MIN_DIAS_SALIDA_LLEGADA, DIAS_MARGEN_ENTRE_RUTAS, MAX_DIAS_ANTICIPACION, getRangoHorario, esDomingo, horaDentroDeRango };
