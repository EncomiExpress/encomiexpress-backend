const { body, param } = require('express-validator');
const r = require('./commonRules');

const createValidation = [
  body('nombre').notEmpty().withMessage('El nombre del permiso es requerido')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres'),
  body('descripcion').optional().isLength({ max: 200 }).withMessage('La descripción no puede exceder 200 caracteres'),
  r.habilitado.optional(),
];

const updateValidation = [
  body('nombre').optional().notEmpty().withMessage('El nombre del permiso no puede estar vacío')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres'),
  body('descripcion').optional().isLength({ max: 200 }).withMessage('La descripción no puede exceder 200 caracteres'),
  r.habilitado.optional(),
];

const idParamValidation = [
  param('id').isInt().withMessage('ID debe ser un número entero'),
];

module.exports = {
  createValidation,
  updateValidation,
  idParamValidation,
};
