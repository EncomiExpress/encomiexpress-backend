const { body } = require('express-validator');
const r = require('./commonRules');

// Debe coincidir con SOLO_LETRAS_REGEX en RegistrarRol.jsx/ActualizarRol.jsx
const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

const createValidation = [
  body('nombre').notEmpty().withMessage('El nombre del rol es requerido')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('El nombre solo puede contener letras'),
  body('descripcion').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('La descripción no puede exceder 200 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('La descripción solo puede contener letras'),
  body('permisos').optional().isArray().withMessage('Los permisos deben ser un array de IDs'),
  r.habilitado.optional(),
];

const updateValidation = [
  body('nombre').optional().notEmpty().withMessage('El nombre del rol no puede estar vacío')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('El nombre solo puede contener letras'),
  body('descripcion').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('La descripción no puede exceder 200 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('La descripción solo puede contener letras'),
  body('permisos').optional().isArray().withMessage('Los permisos deben ser un array de IDs'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
