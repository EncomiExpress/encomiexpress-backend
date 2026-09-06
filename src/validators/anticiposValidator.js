const { body } = require('express-validator');

const createValidation = [
  body('valorAnticipo').notEmpty().withMessage('Valor del anticipo es requerido'),
  body('valorAnticipo').isFloat({ min: 0, max: 9999999 }).withMessage('El valor del anticipo debe estar entre 0 y 9.999.999'),
  body('idRuta').notEmpty().withMessage('ID de ruta es requerido').isInt().withMessage('ID de ruta debe ser un número entero'),
  body('idRutaVehiculoConductor').notEmpty().withMessage('Debes elegir el vehículo y conductor de la ruta').isInt().withMessage('ID de vehículo/conductor de ruta debe ser un número entero'),
  body('soporte').optional().isArray().withMessage('Soporte debe ser un array de URLs')
];

const updateValidation = [
  body('valorAnticipo').optional().isFloat({ min: 0, max: 9999999 }).withMessage('El valor del anticipo debe estar entre 0 y 9.999.999'),
  // El gasto puede superar el anticipo entregado (queda un excedente negativo
  // a favor del conductor) — este techo es solo una cota de sanidad, no una
  // comparación contra valorAnticipo. Más bajo que el de valorAnticipo a
  // propósito: en la práctica un anticipo no se gasta ni de cerca hasta los
  // 9.999.999.
  body('valorGastado').optional().isFloat({ min: 0, max: 999999 }).withMessage('Valor gastado debe ser un número entre 0 y 999.999'),
  body('idRuta').optional().isInt().withMessage('ID de ruta debe ser un número entero'),
  body('idRutaVehiculoConductor').optional().isInt().withMessage('ID de vehículo/conductor de ruta debe ser un número entero'),
  body('soporte').optional().isArray().withMessage('Soporte debe ser un array de URLs')
];

module.exports = {
  createValidation,
  updateValidation
};
