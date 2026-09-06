const { body } = require('express-validator');
const r = require('./commonRules');

const direccionRule = body('direccion').optional().isString().withMessage('Dirección debe ser un texto')
  .isLength({ max: 200 }).withMessage('La dirección no puede exceder 200 caracteres')
  .custom(r.validarDireccionFormato);

const createValidation = [
  r.tipoIdentificacion.required(r.TIPOS_DOC_PROPIETARIO),
  r.numeroIdentificacion.required(r.validarNitEstricto),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.required(),
  r.email.required(),
  direccionRule,
  r.habilitado.optional(),
];

const updateValidation = [
  r.tipoIdentificacion.optional(r.TIPOS_DOC_PROPIETARIO),
  r.numeroIdentificacion.optional(r.validarNitEstricto),
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  direccionRule,
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
