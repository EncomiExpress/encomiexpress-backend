const { body } = require('express-validator');
const r = require('./commonRules');

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('idPropietario').notEmpty().withMessage('Propietario es requerido'),
  body('origen').optional().isIn(['Propio', 'Tercerizado']).withMessage('Origen inválido'),
  body('placa').notEmpty().withMessage('Placa es requerida')
    .matches(/^[A-Z]{3}[0-9]{3}$/).withMessage('La placa debe tener 3 letras seguidas de 3 números, sin guiones ni espacios'),
  body('marca').notEmpty().withMessage('Marca es requerida'),
  body('modelo').notEmpty().withMessage('Modelo es requerido')
    .custom(noSoloRelleno('El modelo no puede contener solo espacios o guiones')),
  body('tarjetaPropiedad').optional({ nullable: true, checkFalsy: true })
    .matches(/^[0-9]{6,11}$/).withMessage('La tarjeta de propiedad debe ser solo números, entre 6 y 11 dígitos'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional().notEmpty().withMessage('Color es requerido'),
  body('tipo').optional().notEmpty().withMessage('Tipo es requerido'),
  body('capacidad').notEmpty().withMessage('La capacidad es obligatoria').isFloat({ min: 1 }).withMessage('La capacidad debe ser de al menos 1 kg'),
  body('vencimientoSOAT').notEmpty().withMessage('La fecha de vencimiento del SOAT es requerida').isDate().withMessage('Fecha de SOAT inválida'),
  body('vencimientoRevisionTecnica').notEmpty().withMessage('La fecha de vencimiento de la Revisión Técnica es requerida').isDate().withMessage('Fecha de Revisión Técnica inválida'),
  body('vencimientoSeguroTerceros').notEmpty().withMessage('La fecha de vencimiento del Seguro de Terceros es requerida').isDate().withMessage('Fecha de Seguro de Terceros inválida'),
];

const updateValidation = [
  body('idPropietario').optional().isInt().withMessage('ID de propietario debe ser un número entero'),
  body('origen').optional().isIn(['Propio', 'Tercerizado']).withMessage('Origen inválido'),
  body('placa').optional().notEmpty().withMessage('Placa es requerida')
    .matches(/^[A-Z]{3}[0-9]{3}$/).withMessage('La placa debe tener 3 letras seguidas de 3 números, sin guiones ni espacios'),
  body('marca').optional().notEmpty().withMessage('Marca es requerida'),
  body('modelo').optional().notEmpty().withMessage('Modelo es requerido')
    .custom(noSoloRelleno('El modelo no puede contener solo espacios o guiones')),
  body('tarjetaPropiedad').optional({ nullable: true, checkFalsy: true })
    .matches(/^[0-9]{6,11}$/).withMessage('La tarjeta de propiedad debe ser solo números, entre 6 y 11 dígitos'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional(),
  body('tipo').optional(),
  body('capacidad').optional().notEmpty().withMessage('La capacidad es obligatoria').isFloat({ min: 1 }).withMessage('La capacidad debe ser de al menos 1 kg')
];

const cambiarEstadoValidation = [
  body('estado')
    .notEmpty().withMessage('El estado es requerido')
    .isIn(['Disponible', 'Mantenimiento']).withMessage('Estado inválido. Use: Disponible, Mantenimiento')
];

module.exports = {
  createValidation,
  updateValidation,
  cambiarEstadoValidation
};
