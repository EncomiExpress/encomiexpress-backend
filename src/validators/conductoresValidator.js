const { body } = require('express-validator');
const r = require('./commonRules');

const ESTADOS_VALIDOS = ['Disponible', 'En Ruta'];

// numeroLicencia no se valida: en Colombia siempre es el número de documento del titular
// (Ley 769 de 2002 — ver CLAUDE.md). El backend lo recibe como espejo de
// numeroIdentificacion, que ya se valida.

const CATEGORIAS_VALIDAS = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

const createValidation = [
  r.tipoIdentificacion.required(r.TIPOS_DOC_CONDUCTOR),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.required(),
  r.email.required(),
  r.password.required(),
  body('categoriasLicencia').isArray({ min: 1 }).withMessage('Debe registrar al menos una categoría de licencia'),
  body('categoriasLicencia.*.categoria').notEmpty().withMessage('La categoría es obligatoria')
    .bail().isIn(CATEGORIAS_VALIDAS).withMessage(`Categoría de licencia inválida. Opciones: ${CATEGORIAS_VALIDAS.join(', ')}`),
  body('categoriasLicencia.*.vencimiento').isDate().withMessage('Fecha de vencimiento inválida'),
];

const updateValidation = [
  r.tipoIdentificacion.optional(r.TIPOS_DOC_CONDUCTOR),
  r.numeroIdentificacion.optional(),
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  r.password.optional(),
  body('categoriasLicencia').optional().isArray({ min: 1 }).withMessage('Debe registrar al menos una categoría de licencia'),
  body('categoriasLicencia.*.categoria').notEmpty().withMessage('La categoría es obligatoria')
    .bail().isIn(CATEGORIAS_VALIDAS).withMessage(`Categoría de licencia inválida. Opciones: ${CATEGORIAS_VALIDAS.join(', ')}`),
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
