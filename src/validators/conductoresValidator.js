const { body } = require('express-validator');
const r = require('./commonRules');

const ESTADOS_VALIDOS = ['Disponible', 'En Ruta'];

const numeroLicenciaRule = body('numeroLicencia').optional().notEmpty().withMessage('Número de licencia es requerido')
  .custom((value) => {
    if (value && r.soloRelleno(value)) throw new Error('El número de licencia no puede contener solo espacios o guiones');
    return true;
  });

const createValidation = [
  r.tipoIdentificacion.required(),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.required(),
  r.password.required(),
  numeroLicenciaRule,
  body('categoriasLicencia').isArray({ min: 1 }).withMessage('Debe registrar al menos una categoría de licencia'),
  body('categoriasLicencia.*.categoria').notEmpty().withMessage('La categoría es obligatoria'),
  body('categoriasLicencia.*.vencimiento').isDate().withMessage('Fecha de vencimiento inválida'),
];

const updateValidation = [
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  r.password.optional(),
  numeroLicenciaRule,
  body('categoriasLicencia').optional().isArray({ min: 1 }).withMessage('Debe registrar al menos una categoría de licencia'),
  body('categoriasLicencia.*.categoria').notEmpty().withMessage('La categoría es obligatoria'),
  body('categoriasLicencia.*.vencimiento').isDate().withMessage('Fecha de vencimiento inválida'),
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
