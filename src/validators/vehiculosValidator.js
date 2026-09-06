const { body } = require('express-validator');
const r = require('./commonRules');

// Mismo alfabeto que filtran en vivo RegistrarVehiculo.jsx/ActualizarVehiculo.jsx para
// marca/color/tipoOtro y que valida vehiculoValidation.js (letras + espacios, con ü/Ü).
const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/;
// El modelo es alfanumérico y admite los signos de la nomenclatura real de autos:
// espacio, guion ("F-150"), punto ("March 1.6") y barra ("4x2/4x4"). Igual que
// MODELO_REGEX en vehiculoValidation.js del frontend.
const MODELO_REGEX = /^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s./-]+$/;

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('idPropietario').notEmpty().withMessage('Propietario es requerido'),
  body('origen').optional().isIn(['Propio', 'Tercerizado']).withMessage('Origen inválido'),
  body('placa').notEmpty().withMessage('Placa es requerida')
    .matches(/^[A-Z]{3}[0-9]{3}$/).withMessage('La placa debe tener 3 letras seguidas de 3 números, sin guiones ni espacios'),
  body('marca').notEmpty().withMessage('Marca es requerida')
    .custom(noSoloRelleno('La marca no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('La marca solo puede contener letras')
    .isLength({ max: 30 }).withMessage('La marca no puede exceder 30 caracteres'),
  body('modelo').notEmpty().withMessage('Modelo es requerido')
    .custom(noSoloRelleno('El modelo no puede contener solo espacios o guiones'))
    .matches(MODELO_REGEX).withMessage('El modelo solo admite letras, números, espacios y los signos . - /')
    .isLength({ max: 30 }).withMessage('El modelo no puede exceder 30 caracteres'),
  body('tarjetaPropiedad').optional({ nullable: true, checkFalsy: true })
    .matches(/^[0-9]{6,11}$/).withMessage('La tarjeta de propiedad debe ser solo números, entre 6 y 11 dígitos'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional().notEmpty().withMessage('Color es requerido')
    .custom(noSoloRelleno('El color no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El color solo puede contener letras')
    .isLength({ max: 20 }).withMessage('El color no puede exceder 20 caracteres'),
  body('tipo').notEmpty().withMessage('Tipo es requerido').bail()
    .custom(noSoloRelleno('El tipo no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El tipo solo puede contener letras')
    .isLength({ max: 30 }).withMessage('El tipo no puede exceder 30 caracteres'),
  body('capacidad').notEmpty().withMessage('La capacidad es obligatoria').isFloat({ min: 1, max: 99999 }).withMessage('La capacidad debe estar entre 1 y 99.999 kg'),
  body('vencimientoSOAT').notEmpty().withMessage('La fecha de vencimiento del SOAT es requerida').isDate().withMessage('Fecha de SOAT inválida'),
  body('vencimientoRevisionTecnica').notEmpty().withMessage('La fecha de vencimiento de la Revisión Técnica es requerida').isDate().withMessage('Fecha de Revisión Técnica inválida'),
  body('vencimientoSeguroTerceros').notEmpty().withMessage('La fecha de vencimiento del Seguro de Terceros es requerida').isDate().withMessage('Fecha de Seguro de Terceros inválida'),
];

const updateValidation = [
  body('idPropietario').optional().isInt().withMessage('ID de propietario debe ser un número entero'),
  body('origen').optional().isIn(['Propio', 'Tercerizado']).withMessage('Origen inválido'),
  body('placa').optional().notEmpty().withMessage('Placa es requerida')
    .matches(/^[A-Z]{3}[0-9]{3}$/).withMessage('La placa debe tener 3 letras seguidas de 3 números, sin guiones ni espacios'),
  body('marca').optional().notEmpty().withMessage('Marca es requerida')
    .custom(noSoloRelleno('La marca no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('La marca solo puede contener letras')
    .isLength({ max: 30 }).withMessage('La marca no puede exceder 30 caracteres'),
  body('modelo').optional().notEmpty().withMessage('Modelo es requerido')
    .custom(noSoloRelleno('El modelo no puede contener solo espacios o guiones'))
    .matches(MODELO_REGEX).withMessage('El modelo solo admite letras, números, espacios y los signos . - /')
    .isLength({ max: 30 }).withMessage('El modelo no puede exceder 30 caracteres'),
  body('tarjetaPropiedad').optional({ nullable: true, checkFalsy: true })
    .matches(/^[0-9]{6,11}$/).withMessage('La tarjeta de propiedad debe ser solo números, entre 6 y 11 dígitos'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional().notEmpty().withMessage('Color es requerido')
    .custom(noSoloRelleno('El color no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El color solo puede contener letras')
    .isLength({ max: 20 }).withMessage('El color no puede exceder 20 caracteres'),
  body('tipo').optional().notEmpty().withMessage('Tipo es requerido').bail()
    .custom(noSoloRelleno('El tipo no puede contener solo espacios o guiones'))
    .matches(SOLO_LETRAS_REGEX).withMessage('El tipo solo puede contener letras')
    .isLength({ max: 30 }).withMessage('El tipo no puede exceder 30 caracteres'),
  body('capacidad').optional().notEmpty().withMessage('La capacidad es obligatoria').isFloat({ min: 1, max: 99999 }).withMessage('La capacidad debe estar entre 1 y 99.999 kg')
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
