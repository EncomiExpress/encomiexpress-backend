const { body } = require('express-validator');
const r = require('./commonRules');
const { PASSWORD_REGEX, PASSWORD_MESSAGE } = r;

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

const cambiarPasswordValidation = [
  body('passwordActual').notEmpty().withMessage('La contraseña actual es requerida'),
  body('passwordNueva').matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
];

module.exports = {
  loginValidation,
  registerValidation,
  recoverPasswordValidation,
  cambiarPasswordValidation,
};
