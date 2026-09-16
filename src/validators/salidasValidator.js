const { body } = require('express-validator');
const r = require('./commonRules');

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('idRuta').notEmpty().withMessage('La ruta (plantilla) es obligatoria').isInt().withMessage('ID de ruta debe ser un número entero'),
  body('pares').optional().isArray({ max: 10 }).withMessage('No puedes asignar más de 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').notEmpty().isInt().withMessage('Vehículo es requerido en cada par'),
  body('pares.*.idConductor').notEmpty().isInt().withMessage('Conductor es requerido en cada par'),
  // Paradas intermedias — ahora son propias de CADA par vehículo+conductor (ya no
  // un array a nivel raíz de la salida), opcionales, ver
  // salidaProgramadaService.validarParadas (el "orden" que se guarda al final es la
  // posición en el array, no lo que mande el cliente, así que no se valida acá).
  body('pares.*.paradas').optional().isArray({ max: 20 }).withMessage('No puedes agregar más de 20 paradas al recorrido de un mismo vehículo'),
  body('pares.*.paradas.*.idDestino').notEmpty().isInt().withMessage('Cada parada necesita un destino'),
  body('observaciones').optional({ nullable: true }).isString()
    .isLength({ max: 500 }).withMessage('Las observaciones no pueden exceder 500 caracteres')
    .custom(r.validarObservacionesRutaFormato),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegadaEstimada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('horaSalida').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de salida inválida'),
  // checkFalsy:true además de nullable:true -- el frontend manda '' (no null) cuando
  // el campo queda vacío, y sin checkFalsy express-validator solo trata como "ausente"
  // null/undefined, así que '' seguía cayendo en .matches() y se rechazaba como si
  // fuera obligatorio.
  body('horaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Ruta', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido'),
  body('idSalidaIda').optional({ nullable: true }).isInt().withMessage('ID de la salida de ida debe ser un número entero'),
];

const updateValidation = [
  body('idRuta').optional().isInt().withMessage('ID de ruta debe ser un número entero'),
  body('pares').optional().isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').optional().isInt().withMessage('ID de vehículo debe ser un número entero'),
  body('pares.*.idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  // Paradas intermedias — propias de CADA par (ver nota en createValidation).
  body('pares.*.paradas').optional().isArray({ max: 20 }).withMessage('No puedes agregar más de 20 paradas al recorrido de un mismo vehículo'),
  body('pares.*.paradas.*.idDestino').notEmpty().isInt().withMessage('Cada parada necesita un destino'),
  body('observaciones').optional({ nullable: true }).isString()
    .isLength({ max: 500 }).withMessage('Las observaciones no pueden exceder 500 caracteres')
    .custom(r.validarObservacionesRutaFormato),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegadaEstimada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('horaSalida').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de salida inválida'),
  body('horaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Ruta', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido'),
];

module.exports = {
  createValidation,
  updateValidation
};
