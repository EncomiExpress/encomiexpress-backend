const { body } = require('express-validator');

const METODOS_PAGO_VALIDOS = ['Contraentrega', 'Efectivo', 'Transferencia', 'Nequi'];
const ESTADOS_PAGO_VALIDOS = ['Pendiente', 'Pagado'];

// ⚠️ FIX: los estados deben estar en minúsculas porque el modelo los almacena
// en minúsculas (ver encomiendaService.js → cambiarEstado → estado.toLowerCase())
// y el frontend también los envía en minúsculas.
const ESTADOS_ENCOMIENDA_VALIDOS = [
  'pendiente de recogida',
  'en recogida',
  'programada',
  'en tránsito',
  'entregado',
  'devuelto',
  'activo',
  'inactivo',
];

const createValidation = [
  body('idCliente').notEmpty().withMessage('Cliente es requerido'),
  body('idCliente').isInt().withMessage('ID de cliente debe ser un número entero'),
  body('idRuta').optional().isInt().withMessage('ID de ruta debe ser un número entero'),
  body('numeroFactura').optional().notEmpty().withMessage('Número de factura debe ser un texto'),
  body('fechaEstimadaEntrega').optional().isDate().withMessage('Fecha estimada de entrega inválida'),
  body('observaciones').optional().isString().withMessage('Observaciones debe ser un texto'),
  body('valorServicio').optional().isFloat({ min: 0 }).withMessage('Valor del servicio debe ser un número positivo'),
  body('impuestos').optional().isFloat({ min: 0 }).withMessage('Impuestos debe ser un número positivo'),
  body('metodoPago')
    .optional()
    .isIn(METODOS_PAGO_VALIDOS)
    .withMessage(`Método de pago inválido. Opciones: ${METODOS_PAGO_VALIDOS.join(', ')}`),
  body('estadoPago')
    .optional()
    .isIn(ESTADOS_PAGO_VALIDOS)
    .withMessage(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`),
  body('destinatario').optional().isObject().withMessage('Destinatario debe ser un objeto'),
  body('paquetes').optional().isArray().withMessage('Paquetes debe ser un array'),
];

const updateValidation = [
  body('idRuta').optional({ nullable: true }).isInt().withMessage('ID de ruta debe ser un número entero'),
  body('numeroFactura').optional(),
  body('fechaEstimadaEntrega').optional().isDate().withMessage('Fecha estimada de entrega inválida'),
  body('observaciones').optional(),
  body('valorServicio').optional().isFloat({ min: 0 }).withMessage('Valor del servicio debe ser un número positivo'),
  body('impuestos').optional().isFloat({ min: 0 }).withMessage('Impuestos debe ser un número positivo'),
  body('metodoPago')
    .optional()
    .isIn(METODOS_PAGO_VALIDOS)
    .withMessage(`Método de pago inválido. Opciones: ${METODOS_PAGO_VALIDOS.join(', ')}`),
  body('estadoPago')
    .optional()
    .isIn(ESTADOS_PAGO_VALIDOS)
    .withMessage(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`),
];

const cambiarEstadoValidation = [
  body('estado')
    .notEmpty()
    .withMessage('Estado es requerido')
    // ⚠️ FIX: normalizar a minúsculas antes de validar para aceptar
    // tanto 'En Tránsito' como 'en tránsito'
    .customSanitizer((value) => (typeof value === 'string' ? value.toLowerCase() : value))
    .isIn(ESTADOS_ENCOMIENDA_VALIDOS)
    .withMessage(`Estado inválido. Opciones: ${ESTADOS_ENCOMIENDA_VALIDOS.join(', ')}`),
];

const agregarPaqueteValidation = [
  body('descripcionContenido').notEmpty().withMessage('Descripción del contenido es requerida'),
  body('peso').optional().isFloat({ min: 0 }).withMessage('Peso debe ser un número positivo'),
  body('alto').optional().isFloat({ min: 0 }),
  body('ancho').optional().isFloat({ min: 0 }),
  body('profundidad').optional().isFloat({ min: 0 }),
  body('valorDeclarado').optional().isFloat({ min: 0 }),
];

const agregarDestinatarioValidation = [
  body('nombreDestinatario').notEmpty().withMessage('Nombre del destinatario es requerido'),
  body('telefonoDestinatario')
    .optional()
    .isMobilePhone()
    .withMessage('Teléfono del destinatario inválido'),
  body('direccionDestinatario')
    .optional()
    .isString()
    .withMessage('Dirección del destinatario debe ser un texto'),
];

module.exports = {
  createValidation,
  updateValidation,
  cambiarEstadoValidation,
  agregarPaqueteValidation,
  agregarDestinatarioValidation,
};