const { body } = require('express-validator');
const r = require('./commonRules');

// La plantilla (Ruta) se reduce a lo puramente estructural: destino obligatorio,
// observaciones opcionales. Sin nombre propio -- se identifica por su corredor
// (Medellín -> destino), igual que antes de la migración Ruta/SalidaProgramada.
// Todo lo que antes vivía acá (pares, paradas, fechas, horas, estado, idRutaIda) se
// movió a validators/salidasValidator.js, junto con la lógica que absorbió
// salidaProgramadaService.js.

const createValidation = [
  body('idDestino').notEmpty().withMessage('Destino es requerido').isInt().withMessage('ID de destino debe ser un número entero'),
  body('observaciones').optional({ nullable: true }).isString()
    .isLength({ max: 500 }).withMessage('Las observaciones no pueden exceder 500 caracteres')
    .custom(r.validarObservacionesRutaFormato),
];

const updateValidation = [
  body('idDestino').optional().isInt().withMessage('ID de destino debe ser un número entero'),
  body('observaciones').optional({ nullable: true }).isString()
    .isLength({ max: 500 }).withMessage('Las observaciones no pueden exceder 500 caracteres')
    .custom(r.validarObservacionesRutaFormato),
];

module.exports = {
  createValidation,
  updateValidation
};
