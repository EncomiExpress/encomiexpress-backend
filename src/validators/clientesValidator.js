const { body } = require('express-validator');
const r = require('./commonRules');

const direccionRule = body('direccion').optional().isString().withMessage('Dirección debe ser un texto')
  .isLength({ max: 200 }).withMessage('La dirección no puede exceder 200 caracteres')
  .custom(r.validarDireccionFormato);

// Municipio del remitente — para saber a dónde devolver un paquete si el
// destinatario nunca lo recoge (ver LOGICA.md). Ya NO viaja en el body: lo
// resuelve el servidor (`clienteService.resolverIdDestinoCliente`) a partir de
// quién registra (la sede del operador_sede, o Medellín en el flujo normal) —
// nunca lo que mande el cliente HTTP. Ver LOGICA.md, "Decisión — Municipio de
// Cliente ya no es editable".
const createValidation = [
  r.tipoIdentificacion.required(r.TIPOS_DOC_CLIENTE),
  r.numeroIdentificacion.required(r.validarNitEstricto),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.optional(),
  r.email.optional(),
  direccionRule,
];

const updateValidation = [
  r.tipoIdentificacion.optional(r.TIPOS_DOC_CLIENTE),
  r.numeroIdentificacion.optional(r.validarNitEstricto),
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
