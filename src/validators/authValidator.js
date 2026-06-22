const { body } = require('express-validator');
const r = require('./commonRules');

const loginValidation = [
  r.email.required(),
  body('password').notEmpty().withMessage('Password es requerido'),
];

const registerValidation = [
  r.tipoIdentificacion.required(),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.required(),
  r.password.required(),
  body('idRol').optional({ nullable: true }).isInt({ min: 1 }).withMessage('ID de rol debe ser un número entero mayor a 0'),
];

const recoverPasswordValidation = [
  r.email.required(),
];

module.exports = {
  loginValidation,
  registerValidation,
  recoverPasswordValidation,
};
