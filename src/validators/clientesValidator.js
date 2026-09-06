const { body } = require('express-validator');
const r = require('./commonRules');

const direccionRule = body('direccion').optional().isString().withMessage('Dirección debe ser un texto')
  .isLength({ max: 200 }).withMessage('La dirección no puede exceder 200 caracteres')
  .custom(r.validarDireccionFormato);

// Municipio del remitente — para saber a dónde devolver un paquete si el
// destinatario nunca lo recoge (ver LOGICA.md). OJO: cada validación necesita su
// propia instancia de body('idDestino') — express-validator devuelve una cadena
// mutable, así que encadenarle métodos distintos en dos arrays que comparten la
// MISMA instancia hace que el último encadenado (.optional() de update) pise la
// configuración del otro (.notEmpty() de create), y ninguno de los dos exige nada.
const createValidation = [
  r.tipoIdentificacion.required(r.TIPOS_DOC_CLIENTE),
  r.numeroIdentificacion.required(r.validarNitEstricto),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.optional(),
  direccionRule,
  body('idDestino').notEmpty().withMessage('El municipio es requerido').isInt().withMessage('Municipio inválido'),
];

const updateValidation = [
  r.tipoIdentificacion.optional(r.TIPOS_DOC_CLIENTE),
  r.numeroIdentificacion.optional(r.validarNitEstricto),
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  direccionRule,
  body('idDestino').optional().isInt().withMessage('Municipio inválido'),
];

module.exports = {
  createValidation,
  updateValidation,
};
