const { body } = require('express-validator');
const r = require('./commonRules');
const { PASSWORD_REGEX, PASSWORD_MESSAGE } = r;

const loginValidation = [
  r.email.required(),
  body('password').notEmpty().withMessage('Password es requerido'),
];

const recoverPasswordValidation = [
  r.email.required(),
];

const cambiarPasswordValidation = [
  body('passwordActual').notEmpty().withMessage('La contraseña actual es requerida'),
  body('passwordNueva').matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token es requerido'),
  body('passwordNueva').matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
];

module.exports = {
  loginValidation,
  recoverPasswordValidation,
  cambiarPasswordValidation,
  resetPasswordValidation,
};
