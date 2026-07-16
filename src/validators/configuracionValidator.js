const { body } = require('express-validator');

const updateValidation = [
  body('tarifaPorKg')
    .notEmpty().withMessage('La tarifa por kg es obligatoria')
    .isFloat({ min: 0 }).withMessage('La tarifa por kg debe ser un número mayor o igual a 0'),
];

module.exports = { updateValidation };
