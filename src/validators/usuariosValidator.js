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
  body('idRol').optional().isInt().withMessage('ID de rol debe ser un número entero'),
  r.habilitado.optional(),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Password actual es requerido'),
  body('newPassword').isLength({ min: 6 }).withMessage('Nuevo password debe tener al menos 6 caracteres'),
];

module.exports = {
  createValidation,
  updateValidation,
  changePasswordValidation,
};
