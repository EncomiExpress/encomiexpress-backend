const { body } = require('express-validator');

const createValidation = [
  body('pares').isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').notEmpty().isInt().withMessage('Vehículo es requerido en cada par'),
  body('pares.*.idConductor').notEmpty().isInt().withMessage('Conductor es requerido en cada par'),
  body('idDestino').notEmpty().withMessage('Destino es requerido'),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Curso', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido')
];

const updateValidation = [
  body('pares').optional().isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').optional().isInt().withMessage('ID de vehículo debe ser un número entero'),
  body('pares.*.idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idDestino').optional().isInt().withMessage('ID de destino debe ser un número entero'),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Curso', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido')
];

module.exports = {
  createValidation,
  updateValidation
};
