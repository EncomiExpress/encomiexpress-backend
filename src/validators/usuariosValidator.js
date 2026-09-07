const { body } = require('express-validator');
const r = require('./commonRules');

// Sede del distribuidor — un distribuidor cubre UNA sola sede, pero el campo viaja
// como array (contrato con usuario_sede). La exigencia de "exactamente una si el
// rol es distribuidor" vive en usuarioService (necesita resolver idRol -> nombre);
// aquí solo se valida la forma del dato.
const sedesRule = body('sedes')
  .optional()
  .isArray({ max: 1 }).withMessage('Un distribuidor cubre una sola sede');
const sedesItemRule = body('sedes.*')
  .isInt({ min: 1 }).withMessage('Cada sede debe ser un id de destino válido');

const createValidation = [
  r.tipoIdentificacion.required(r.TIPOS_DOC_USUARIO),
  r.numeroIdentificacion.required(),
  r.nombre.required(),
  r.apellido.required(),
  r.telefono.required(),
  r.email.required(),
  r.password.required(),
  body('idRol').notEmpty().withMessage('El rol es requerido').bail().isInt().withMessage('ID de rol debe ser un número entero'),
  sedesRule,
  sedesItemRule,
];

const updateValidation = [
  r.tipoIdentificacion.optional(r.TIPOS_DOC_USUARIO),
  r.numeroIdentificacion.optional(),
  r.nombre.optional(),
  r.apellido.optional(),
  r.telefono.optional(),
  r.email.optional(),
  r.password.optional(),
  body('idRol').optional().isInt().withMessage('ID de rol debe ser un número entero'),
  r.habilitado.optional(),
  sedesRule,
  sedesItemRule,
];

module.exports = {
  createValidation,
  updateValidation,
};
