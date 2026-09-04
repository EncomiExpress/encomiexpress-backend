const { body } = require('express-validator');
const r = require('./commonRules');

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const createValidation = [
  body('pares').isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').notEmpty().isInt().withMessage('Vehículo es requerido en cada par'),
  body('pares.*.idConductor').notEmpty().isInt().withMessage('Conductor es requerido en cada par'),
  body('idDestino').notEmpty().withMessage('Destino es requerido'),
  body('origen').notEmpty().withMessage('El origen de la ruta es requerido')
    .custom(noSoloRelleno('El origen de la ruta no puede contener solo espacios o guiones')),
  body('observaciones').optional({ nullable: true }).isString()
    .custom(noSoloRelleno('Las observaciones no pueden contener solo espacios o guiones')),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegadaEstimada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('horaSalida').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de salida inválida'),
  // checkFalsy:true además de nullable:true -- el frontend manda '' (no null) cuando
  // el campo queda vacío, y sin checkFalsy express-validator solo trata como "ausente"
  // null/undefined, así que '' seguía cayendo en .matches() y se rechazaba como si
  // fuera obligatorio.
  body('horaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Ruta', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido'),
  // Paradas intermedias del corredor — opcionales, ver rutaService.validarParadas
  // (el "orden" que se guarda al final es la posición en el array, no lo que
  // mande el cliente, así que no se valida acá).
  body('paradas').optional().isArray({ max: 20 }).withMessage('No puedes agregar más de 20 paradas a una misma ruta'),
  body('paradas.*.idDestino').notEmpty().isInt().withMessage('Cada parada necesita un destino'),
  body('paradas.*.fechaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).isDate().withMessage('Fecha estimada de paso inválida en una parada'),
  body('paradas.*.horaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora estimada de paso inválida en una parada'),
  body('idRutaIda').optional({ nullable: true }).isInt().withMessage('ID de ruta de ida debe ser un número entero'),
];

const updateValidation = [
  body('pares').optional().isArray({ min: 1, max: 10 }).withMessage('Debes asignar entre 1 y 10 vehículos con su conductor'),
  body('pares.*.idVehiculo').optional().isInt().withMessage('ID de vehículo debe ser un número entero'),
  body('pares.*.idConductor').optional().isInt().withMessage('ID de conductor debe ser un número entero'),
  body('idDestino').optional().isInt().withMessage('ID de destino debe ser un número entero'),
  body('origen').optional().notEmpty().withMessage('El origen de la ruta no puede estar vacío')
    .custom(noSoloRelleno('El origen de la ruta no puede contener solo espacios o guiones')),
  body('observaciones').optional({ nullable: true }).isString()
    .custom(noSoloRelleno('Las observaciones no pueden contener solo espacios o guiones')),
  body('fechaSalida').optional().isDate().withMessage('Fecha de salida inválida'),
  body('fechaLlegadaEstimada').optional().isDate().withMessage('Fecha de llegada inválida'),
  body('horaSalida').optional().matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de salida inválida'),
  // checkFalsy:true además de nullable:true -- el frontend manda '' (no null) cuando
  // el campo queda vacío, y sin checkFalsy express-validator solo trata como "ausente"
  // null/undefined, así que '' seguía cayendo en .matches() y se rechazaba como si
  // fuera obligatorio.
  body('horaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora de llegada inválida'),
  body('estado').optional().isIn(['Programada', 'En Ruta', 'Completada', 'Cancelada']).withMessage('Estado de ruta inválido'),
  body('paradas').optional().isArray({ max: 20 }).withMessage('No puedes agregar más de 20 paradas a una misma ruta'),
  body('paradas.*.idDestino').notEmpty().isInt().withMessage('Cada parada necesita un destino'),
  body('paradas.*.fechaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).isDate().withMessage('Fecha estimada de paso inválida en una parada'),
  body('paradas.*.horaLlegadaEstimada').optional({ nullable: true, checkFalsy: true }).matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('Hora estimada de paso inválida en una parada'),
];

module.exports = {
  createValidation,
  updateValidation
};
