const { body } = require('express-validator');
const r = require('./commonRules');

const createValidation = [
  r.tipoIdentificacion.required(r.TIPOS_DOC_USUARIO),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.required(),
  r.email.required(),
  r.password.required(),
  body('idRol').notEmpty().withMessage('El rol es requerido').bail().isInt().withMessage('ID de rol debe ser un número entero'),
];

const updateValidation = [
  r.tipoIdentificacion.optional(r.TIPOS_DOC_USUARIO),
  r.numeroIdentificacion.optional(),
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  r.password.optional(),
  body('idRol').optional().isInt().withMessage('ID de rol debe ser un número entero'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
