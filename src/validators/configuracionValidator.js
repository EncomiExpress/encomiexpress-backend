const { body } = require('express-validator');

// Cada control del panel (Ventas: Tarifa por kg hierro/normal, Tarifa por
// paquete) guarda solo su propio valor -- por eso los tres campos son
// opcionales acá (nunca se exige mandarlos todos a la vez); configuracionService
// .update() solo toca en la fila el campo que de verdad llegó en el body.
const updateValidation = [
  body('tarifaPorKgHierro')
    .optional()
    .isFloat({ min: 0 }).withMessage('La tarifa por kg (hierro) debe ser un número mayor o igual a 0'),
  body('tarifaPorKgNormal')
    .optional()
    .isFloat({ min: 0 }).withMessage('La tarifa por kg (normal) debe ser un número mayor o igual a 0'),
  body('tarifaPorPaquete')
    .optional()
    .isFloat({ min: 0 }).withMessage('La tarifa por paquete debe ser un número mayor o igual a 0'),
];

module.exports = { updateValidation };
