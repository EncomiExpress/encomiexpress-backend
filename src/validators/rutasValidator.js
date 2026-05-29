const { body } = require('express-validator');

const createValidation = [
  body('idVehiculo').notEmpty().withMessage('Vehículo es requerido'),
  body('idConductor').notEmpty().withMessage('Conductor es requerido'),
  body('idDestino').notEmpty().withMessage('Destino es requerido'),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Curso', 'Finalizada', 'Cancelada']).withMessage('Estado de ruta inválido')
];

const updateValidation = [
  body('idVehiculo').optional().isInt().withMessage('ID de vehículo debe ser un número entero'),
  body('idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idDestino').optional().isInt().withMessage('ID de destino debe ser un número entero'),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Curso', 'Finalizada', 'Cancelada']).withMessage('Estado de ruta inválido')
];

module.exports = {
  createValidation,
  updateValidation
};