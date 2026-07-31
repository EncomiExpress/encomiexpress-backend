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
  r.habilitado.optional(),
];

const updateValidation = [
  r.tipoIdentificacion.optional(),
  r.numeroIdentificacion.optional(),
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
