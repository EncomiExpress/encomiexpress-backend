const { body } = require('express-validator');
const r = require('./commonRules');

// Mismo regex que valida destinoValidation.js en el frontend (defensa en el servidor
// por si el dato llega de otra forma que no sea el Autocomplete Departamento/Municipio
// del wizard). Incluye el punto porque "Bogotá D.C." es el único municipio real de
// Colombia (de los ~1100 que trae la API que alimenta ese Autocomplete) que no es
// solo letras/espacios/tildes.
const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s.]+$/;
const MAX_LEN = 60;

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('departamento').notEmpty().withMessage('Departamento es requerido')
    .custom(noSoloRelleno('El departamento no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El departamento solo puede contener letras')
    .isLength({ max: MAX_LEN }).withMessage(`El departamento no puede exceder ${MAX_LEN} caracteres`),
  body('municipio').notEmpty().withMessage('Municipio es requerido')
    .custom(noSoloRelleno('El municipio no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El municipio solo puede contener letras')
    .isLength({ max: MAX_LEN }).withMessage(`El municipio no puede exceder ${MAX_LEN} caracteres`),
  body('direccion').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Dirección no puede exceder 200 caracteres')
    .custom(r.validarDireccionFormato),
  body('tarifaBase').optional().isFloat({ min: 0, max: 9999999 }).withMessage('La tarifa base debe estar entre 0 y 9.999.999'),
];

const updateValidation = [
  body('departamento').optional().notEmpty().withMessage('Departamento no puede estar vacío')
    .custom(noSoloRelleno('El departamento no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El departamento solo puede contener letras')
    .isLength({ max: MAX_LEN }).withMessage(`El departamento no puede exceder ${MAX_LEN} caracteres`),
  body('municipio').optional().notEmpty().withMessage('Municipio no puede estar vacío')
    .custom(noSoloRelleno('El municipio no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El municipio solo puede contener letras')
    .isLength({ max: MAX_LEN }).withMessage(`El municipio no puede exceder ${MAX_LEN} caracteres`),
  body('direccion').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Dirección no puede exceder 200 caracteres')
    .custom(r.validarDireccionFormato),
  body('tarifaBase').optional().isFloat({ min: 0, max: 9999999 }).withMessage('La tarifa base debe estar entre 0 y 9.999.999'),
  r.habilitado.optional(),
];

module.exports = {
  createValidation,
  updateValidation,
};
