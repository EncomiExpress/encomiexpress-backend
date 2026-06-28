const { body } = require('express-validator');

const createValidation = [
  body('idConductor').notEmpty().withMessage('Conductor es requerido'),
  body('idPropietario').notEmpty().withMessage('Propietario es requerido'),
  body('placa').notEmpty().withMessage('Placa es requerida'),
  body('marca').notEmpty().withMessage('Marca es requerida'),
  body('modelo').notEmpty().withMessage('Modelo es requerido'),
  body('anio').optional().isInt({ min: 1900, max: 2100 }).withMessage('Año inválido'),
  body('color').optional().notEmpty().withMessage('Color es requerido'),
  body('tipo').optional().notEmpty().withMessage('Tipo es requerido'),
  body('capacidad').optional().isFloat({ min: 0 }).withMessage('Capacidad debe ser un número positivo')
];

const updateValidation = [
  body('idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idPropietario').optional().isInt().withMessage('ID de propietario debe ser un número entero'),
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
