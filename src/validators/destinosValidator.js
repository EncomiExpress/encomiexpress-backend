const { body } = require('express-validator');
const r = require('./commonRules');

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('departamento').notEmpty().withMessage('Departamento es requerido'),
  body('ciudad').notEmpty().withMessage('Ciudad es requerida')
    .custom(noSoloRelleno('La ciudad no puede contener solo espacios o guiones')),
  body('direccion').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Dirección no puede exceder 200 caracteres')
    .custom(noSoloRelleno('La dirección no puede contener solo espacios o guiones')),
  body('tarifaBase').optional().isFloat({ min: 0 }).withMessage('Tarifa base debe ser un número positivo'),
];

const updateValidation = [
  body('departamento').optional().notEmpty().withMessage('Departamento no puede estar vacío'),
  body('ciudad').optional().notEmpty().withMessage('Ciudad no puede estar vacía')
    .custom(noSoloRelleno('La ciudad no puede contener solo espacios o guiones')),
  body('direccion').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Dirección no puede exceder 200 caracteres')
    .custom(noSoloRelleno('La dirección no puede contener solo espacios o guiones')),
  body('tarifaBase').optional().isFloat({ min: 0 }).withMessage('Tarifa base debe ser un número positivo'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
