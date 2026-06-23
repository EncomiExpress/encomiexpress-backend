const { body } = require('express-validator');
const r = require('./commonRules');

const ESTADOS_VALIDOS = ['activo', 'inactivo'];

const createValidation = [
  r.tipoIdentificacion.required(),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.required(),
  r.password.required(),
  body('categoriaLicencia').optional().notEmpty().withMessage('Categoría de licencia es requerida'),
  body('numeroLicencia').optional().notEmpty().withMessage('Número de licencia es requerido'),
  body('vencimientoLicencia').optional().isDate().withMessage('Fecha de vencimiento inválida'),
];

const updateValidation = [
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  body('categoriaLicencia').optional(),
  body('numeroLicencia').optional(),
  body('vencimientoLicencia').optional().isDate().withMessage('Fecha de vencimiento inválida'),
];

const cambiarEstadoValidation = [
  body('estado')
    .notEmpty().withMessage('El campo "estado" es requerido')
    .isIn(ESTADOS_VALIDOS).withMessage(`Estado inválido. Opciones: ${ESTADOS_VALIDOS.join(', ')}`),
];

module.exports = {
  createValidation,
  updateValidation,
  cambiarEstadoValidation,
};
