const { body } = require('express-validator');
const r = require('./commonRules');

const createValidation = [
  body('departamento').notEmpty().withMessage('Departamento es requerido'),
  body('ciudad').notEmpty().withMessage('Ciudad es requerida'),
  body('direccion').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Dirección no puede exceder 200 caracteres'),
  body('tarifaBase').optional().isFloat({ min: 0 }).withMessage('Tarifa base debe ser un número positivo'),
];

const updateValidation = [
  body('departamento').optional().notEmpty().withMessage('Departamento no puede estar vacío'),
  body('ciudad').optional().notEmpty().withMessage('Ciudad no puede estar vacía'),
  body('direccion').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Dirección no puede exceder 200 caracteres'),
  body('tarifaBase').optional().isFloat({ min: 0 }).withMessage('Tarifa base debe ser un número positivo'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
