const { body } = require('express-validator');

const createValidation = [
  body('valorAnticipo').notEmpty().withMessage('Valor del anticipo es requerido'),
  body('valorAnticipo').isFloat({ min: 0 }).withMessage('Valor del anticipo debe ser un número positivo'),
  body('idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idRuta').notEmpty().withMessage('ID de ruta es requerido').isInt().withMessage('ID de ruta debe ser un número entero'),
  body('soporte').optional().isArray().withMessage('Soporte debe ser un array de URLs')
];

const updateValidation = [
  body('valorAnticipo').optional().isFloat({ min: 0 }).withMessage('Valor del anticipo debe ser un número positivo'),
  body('idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idRuta').optional().isInt().withMessage('ID de ruta debe ser un número entero'),
  body('soporte').optional().isArray().withMessage('Soporte debe ser un array de URLs')
];

module.exports = {
  createValidation,
  updateValidation
};
