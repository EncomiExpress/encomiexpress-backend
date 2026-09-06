const { body } = require('express-validator');

// Cada control del panel (Ventas: Tarifa por kg hierro/normal, Tarifa por
// paquete) guarda solo su propio valor -- por eso los tres campos son
// opcionales acá (nunca se exige mandarlos todos a la vez); configuracionService
// .update() solo toca en la fila el campo que de verdad llegó en el body.
// Topes que coinciden con MAX_TARIFA_KG / MAX_TARIFA_PAQUETE del frontend
// (features/ventas/hooks/useTarifaEditor.js).
const updateValidation = [
  body('tarifaPorKgHierro')
    .optional()
    .isFloat({ min: 0, max: 9999 }).withMessage('La tarifa por kg (hierro) debe estar entre 0 y 9.999'),
  body('tarifaPorKgNormal')
    .optional()
    .isFloat({ min: 0, max: 9999 }).withMessage('La tarifa por kg (normal) debe estar entre 0 y 9.999'),
  body('tarifaPorPaquete')
    .optional()
    .isFloat({ min: 0, max: 99999 }).withMessage('La tarifa por paquete debe estar entre 0 y 99.999'),
];

module.exports = { updateValidation };
