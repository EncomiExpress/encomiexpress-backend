const { body } = require('express-validator');

const createValidation = [
  body('idPropietario').notEmpty().withMessage('Propietario es requerido'),
  body('origen').optional().isIn(['Propio', 'Tercerizado']).withMessage('Origen inválido'),
  body('placa').notEmpty().withMessage('Placa es requerida'),
  body('marca').notEmpty().withMessage('Marca es requerida'),
  body('modelo').notEmpty().withMessage('Modelo es requerido'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional().notEmpty().withMessage('Color es requerido'),
  body('tipo').optional().notEmpty().withMessage('Tipo es requerido'),
  body('capacidad').optional().isFloat({ min: 0 }).withMessage('Capacidad debe ser un número positivo'),
  body('vencimientoSOAT').notEmpty().withMessage('La fecha de vencimiento del SOAT es requerida').isDate().withMessage('Fecha de SOAT inválida'),
  body('vencimientoRevisionTecnica').notEmpty().withMessage('La fecha de vencimiento de la Revisión Técnica es requerida').isDate().withMessage('Fecha de Revisión Técnica inválida'),
  body('vencimientoSeguroTerceros').notEmpty().withMessage('La fecha de vencimiento del Seguro de Terceros es requerida').isDate().withMessage('Fecha de Seguro de Terceros inválida'),
];

const updateValidation = [
  body('idPropietario').optional().isInt().withMessage('ID de propietario debe ser un número entero'),
  body('origen').optional().isIn(['Propio', 'Tercerizado']).withMessage('Origen inválido'),
  body('placa').optional().notEmpty().withMessage('Placa es requerida'),
  body('marca').optional().notEmpty().withMessage('Marca es requerida'),
  body('modelo').optional().notEmpty().withMessage('Modelo es requerido'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional(),
  body('tipo').optional(),
  body('capacidad').optional().isFloat({ min: 0 }).withMessage('Capacidad debe ser un número positivo')
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
