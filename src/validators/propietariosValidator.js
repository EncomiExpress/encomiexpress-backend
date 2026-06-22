const { body } = require('express-validator');
const r = require('./commonRules');

const createValidation = [
  r.tipoIdentificacion.required(),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.optional(),
  body('direccion').optional().isString().withMessage('Dirección debe ser un texto'),
  r.habilitado.optional(),
];

const updateValidation = [
  r.tipoIdentificacion.optional(),
  r.numeroIdentificacion.optional(),
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  body('direccion').optional().isString().withMessage('Dirección debe ser un texto'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
