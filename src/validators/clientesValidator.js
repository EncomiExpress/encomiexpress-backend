const { body } = require('express-validator');
const r = require('./commonRules');

const direccionRule = body('direccion').optional().isString().withMessage('Dirección debe ser un texto')
  .custom((value) => {
    if (value && r.soloRelleno(value)) throw new Error('La dirección no puede contener solo espacios o guiones');
    return true;
  });

const createValidation = [
  r.tipoIdentificacion.required(),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.optional(),
  direccionRule,
];

const updateValidation = [
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  direccionRule,
];

module.exports = {
  createValidation,
  updateValidation,
};
