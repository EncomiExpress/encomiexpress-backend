const { body } = require('express-validator');

const METODOS_PAGO_VALIDOS = ['Contraentrega', 'Efectivo', 'Transferencia', 'Nequi'];
const ESTADOS_PAGO_VALIDOS = ['Pendiente', 'Pagado'];

const ESTADOS_ENCOMIENDA_VALIDOS = [
  'Programada',
  'En Tránsito',
  'Entregada',
  'Cancelada',
];

const createValidation = [
  body('idCliente').notEmpty().withMessage('Cliente es requerido'),
  body('idCliente').isInt().withMessage('ID de cliente debe ser un número entero'),
  body('idRuta').notEmpty().withMessage('La ruta es obligatoria'),
  body('idRuta').isInt().withMessage('ID de ruta debe ser un número entero'),
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
  body('destinatario').notEmpty().withMessage('El destinatario es obligatorio').isObject().withMessage('Destinatario debe ser un objeto'),
  body('destinatario.nombreDestinatario')
    .notEmpty().withMessage('El nombre del destinatario es obligatorio')
    .isLength({ max: 150 }).withMessage('El nombre del destinatario es demasiado largo'),
  body('paquetes').isArray({ min: 1 }).withMessage('Debe registrar al menos un paquete'),
  body('paquetes.*.peso')
    .notEmpty().withMessage('El peso del paquete es obligatorio')
    .isFloat({ min: 0.01 }).withMessage('El peso del paquete debe ser mayor a 0'),
];

const updateValidation = [
  body('idRuta').optional().isInt().withMessage('ID de ruta debe ser un número entero'),
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
  body('destinatario').optional().isObject().withMessage('Destinatario debe ser un objeto'),
  body('destinatario.nombreDestinatario')
    .if(body('destinatario').exists())
    .notEmpty().withMessage('El nombre del destinatario es obligatorio')
    .isLength({ max: 150 }).withMessage('El nombre del destinatario es demasiado largo'),
  body('paquetes').optional().isArray({ min: 1 }).withMessage('Debe registrar al menos un paquete'),
  body('paquetes.*.peso')
    .notEmpty().withMessage('El peso del paquete es obligatorio')
    .isFloat({ min: 0.01 }).withMessage('El peso del paquete debe ser mayor a 0'),
];

const cambiarEstadoValidation = [
  body('estado')
    .notEmpty()
    .withMessage('Estado es requerido')
    .isIn(ESTADOS_ENCOMIENDA_VALIDOS)
    .withMessage(`Estado inválido. Opciones: ${ESTADOS_ENCOMIENDA_VALIDOS.join(', ')}`),
];

const cambiarEstadoPagoValidation = [
  body('estadoPago')
    .notEmpty()
    .withMessage('Estado de pago es requerido')
    .isIn(ESTADOS_PAGO_VALIDOS)
    .withMessage(`Estado de pago inválido. Opciones: ${ESTADOS_PAGO_VALIDOS.join(', ')}`),
];

module.exports = {
  createValidation,
  updateValidation,
  cambiarEstadoValidation,
  cambiarEstadoPagoValidation,
};