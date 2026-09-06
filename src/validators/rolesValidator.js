const { body } = require('express-validator');
const r = require('./commonRules');

// Debe coincidir con SOLO_LETRAS_REGEX en RegistrarRol.jsx/ActualizarRol.jsx
const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/;
// Debe coincidir con esSoloRelleno en shared/utils/formatters.js — SOLO_LETRAS_REGEX ya
// prohíbe dígitos/guiones/guiones bajos, pero \s sigue permitido (para "Asesor comercial"),
// así que un valor de puros espacios pasaba esa validación igual. Este chequeo aparte
// bloquea eso tanto para nombre (ya cubierto por notEmpty, pero notEmpty no hace trim)
// como para descripcion (opcional, sin ningún otro chequeo de vacío).
const noSoloEspacios = (value) => !value || value.trim().length > 0;

const createValidation = [
  body('nombre').notEmpty().withMessage('El nombre del rol es requerido')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('El nombre solo puede contener letras')
    .custom(noSoloEspacios).withMessage('El nombre no puede contener solo espacios'),
  body('descripcion').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('La descripción no puede exceder 200 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('La descripción solo puede contener letras')
    .custom(noSoloEspacios).withMessage('La descripción no puede contener solo espacios'),
  body('permisos').isArray({ min: 1 }).withMessage('Debes seleccionar al menos un permiso'),
  r.habilitado.optional(),
];

const updateValidation = [
  body('nombre').optional().notEmpty().withMessage('El nombre del rol no puede estar vacío')
    .isLength({ max: 50 }).withMessage('El nombre no puede exceder 50 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('El nombre solo puede contener letras')
    .custom(noSoloEspacios).withMessage('El nombre no puede contener solo espacios'),
  body('descripcion').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('La descripción no puede exceder 200 caracteres')
    .matches(SOLO_LETRAS_REGEX).withMessage('La descripción solo puede contener letras')
    .custom(noSoloEspacios).withMessage('La descripción no puede contener solo espacios'),
  body('permisos').optional().isArray({ min: 1 }).withMessage('Debes seleccionar al menos un permiso'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
