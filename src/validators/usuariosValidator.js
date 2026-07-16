const { body } = require('express-validator');
const r = require('./commonRules');

const createValidation = [
  r.tipoIdentificacion.required(),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.email.required(),
  r.password.required(),
  body('idRol').isInt().withMessage('ID de rol debe ser un número entero'),
];

const updateValidation = [
  r.nombre.optional(),
  r.apellido.optional(),
  r.email.optional(),
  r.password.optional(),
  body('idRol').optional().isInt().withMessage('ID de rol debe ser un número entero'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
