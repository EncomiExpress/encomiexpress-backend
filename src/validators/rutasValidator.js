const { body } = require('express-validator');
const r = require('./commonRules');

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('pares').isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').notEmpty().isInt().withMessage('Vehículo es requerido en cada par'),
  body('pares.*.idConductor').notEmpty().isInt().withMessage('Conductor es requerido en cada par'),
  body('idDestino').notEmpty().withMessage('Destino es requerido'),
  body('origen').notEmpty().withMessage('El origen de la ruta es requerido')
    .custom(noSoloRelleno('El origen de la ruta no puede contener solo espacios o guiones')),
  body('observaciones').optional({ nullable: true }).isString()
    .custom(noSoloRelleno('Las observaciones no pueden contener solo espacios o guiones')),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegadaEstimada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('horaSalida').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de salida inválida'),
  body('horaLlegadaEstimada').optional({ nullable: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Ruta', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido')
];

const updateValidation = [
  body('pares').optional().isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').optional().isInt().withMessage('ID de vehículo debe ser un número entero'),
  body('pares.*.idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idDestino').optional().isInt().withMessage('ID de destino debe ser un número entero'),
  body('origen').optional().notEmpty().withMessage('El origen de la ruta no puede estar vacío')
    .custom(noSoloRelleno('El origen de la ruta no puede contener solo espacios o guiones')),
  body('observaciones').optional({ nullable: true }).isString()
    .custom(noSoloRelleno('Las observaciones no pueden contener solo espacios o guiones')),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegadaEstimada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('horaSalida').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de salida inválida'),
  body('horaLlegadaEstimada').optional({ nullable: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Ruta', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido')
];

module.exports = {
  createValidation,
  updateValidation
};
