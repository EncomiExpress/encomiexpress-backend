const { body } = require('express-validator');
const r = require('./commonRules');

const noSoloRelleno = (mensaje) => (value) => {
  if (value && r.soloRelleno(value)) throw new Error(mensaje);
  return true;
};

const METODOS_PAGO_VALIDOS = ['Contraentrega', 'Efectivo', 'Transferencia'];
const ESTADOS_PAGO_VALIDOS = ['Pendiente', 'Pagado'];

const ESTADOS_ENCOMIENDA_VALIDOS = [
  'Programada',
  'En Ruta',
  'Entregada',
  'Completada con novedades',
  'Cancelada',
];

const createValidation = [
  body('idCliente').notEmpty().withMessage('Cliente es requerido'),
  body('idCliente').isInt().withMessage('ID de cliente debe ser un número entero'),
  body('idRuta').notEmpty().withMessage('La ruta es obligatoria'),
  body('idRuta').isInt().withMessage('ID de ruta debe ser un número entero'),
  body('fechaEstimadaEntrega').optional({ nullable: true }).isDate().withMessage('Fecha estimada de entrega inválida'),
  body('observaciones').optional({ nullable: true }).isString().withMessage('Observaciones debe ser un texto')
    .custom(noSoloRelleno('Las observaciones no pueden contener solo espacios o guiones')),
  body('valorServicio').optional().isFloat({ min: 0 }).withMessage('Valor del servicio debe ser un número positivo'),
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
  body('destinatario.idDestino')
    .notEmpty().withMessage('El municipio de destino del destinatario es obligatorio')
    .isInt().withMessage('ID de destino debe ser un número entero'),
  body('destinatario.correoDestinatario')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('El correo del destinatario no es válido')
    .isLength({ max: 150 }).withMessage('El correo del destinatario es demasiado largo'),
  body('destinatario.direccionDestinatario')
    .notEmpty().withMessage('La dirección del destinatario es obligatoria')
    .custom(noSoloRelleno('La dirección no puede contener solo espacios o guiones')),
  body('paquetes').isArray({ min: 1 }).withMessage('Debe registrar al menos un paquete'),
  body('paquetes.*.descripcionContenido')
    .notEmpty().withMessage('La descripción del paquete es obligatoria')
    .isLength({ max: 300 }).withMessage('Máximo 300 caracteres')
    .custom(noSoloRelleno('La descripción no puede contener solo espacios o guiones')),
  body('paquetes.*.peso')
    .notEmpty().withMessage('El peso del paquete es obligatorio')
    .isFloat({ min: 1 }).withMessage('El peso del paquete debe ser de al menos 1 kg'),
  body('paquetes.*.alto').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('El alto del paquete debe ser de al menos 1 cm'),
  body('paquetes.*.ancho').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('El ancho del paquete debe ser de al menos 1 cm'),
  body('paquetes.*.profundidad').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('La profundidad del paquete debe ser de al menos 1 cm'),
  body('paquetes.*.valorDeclarado').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('El valor declarado debe ser de al menos $1'),
  body('paquetes.*.tipoCarga')
    .notEmpty().withMessage('Debes indicar el tipo de carga')
    .isIn(['hierro', 'normal']).withMessage('Tipo de carga inválido. Opciones: hierro, normal'),
  body('paquetes.*.idRutaVehiculoConductor')
    .notEmpty().withMessage('Cada paquete debe tener un vehículo asignado')
    .isInt().withMessage('ID de vehículo/conductor de ruta debe ser un número entero'),
];

const updateValidation = [
  body('idRuta').optional().isInt().withMessage('ID de ruta debe ser un número entero'),
  body('fechaEstimadaEntrega').optional({ nullable: true }).isDate().withMessage('Fecha estimada de entrega inválida'),
  body('observaciones').optional({ nullable: true }).isString().withMessage('Observaciones debe ser un texto')
    .custom(noSoloRelleno('Las observaciones no pueden contener solo espacios o guiones')),
  body('valorServicio').optional().isFloat({ min: 0 }).withMessage('Valor del servicio debe ser un número positivo'),
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
  body('destinatario.idDestino')
    .if(body('destinatario').exists())
    .notEmpty().withMessage('El municipio de destino del destinatario es obligatorio')
    .isInt().withMessage('ID de destino debe ser un número entero'),
  body('destinatario.correoDestinatario')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('El correo del destinatario no es válido')
    .isLength({ max: 150 }).withMessage('El correo del destinatario es demasiado largo'),
  body('destinatario.direccionDestinatario')
    .if(body('destinatario').exists())
    .notEmpty().withMessage('La dirección del destinatario es obligatoria')
    .custom(noSoloRelleno('La dirección no puede contener solo espacios o guiones')),
  body('paquetes').optional().isArray({ min: 1 }).withMessage('Debe registrar al menos un paquete'),
  body('paquetes.*.descripcionContenido')
    .notEmpty().withMessage('La descripción del paquete es obligatoria')
    .isLength({ max: 300 }).withMessage('Máximo 300 caracteres')
    .custom(noSoloRelleno('La descripción no puede contener solo espacios o guiones')),
  body('paquetes.*.peso')
    .notEmpty().withMessage('El peso del paquete es obligatorio')
    .isFloat({ min: 1 }).withMessage('El peso del paquete debe ser de al menos 1 kg'),
  body('paquetes.*.alto').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('El alto del paquete debe ser de al menos 1 cm'),
  body('paquetes.*.ancho').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('El ancho del paquete debe ser de al menos 1 cm'),
  body('paquetes.*.profundidad').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('La profundidad del paquete debe ser de al menos 1 cm'),
  body('paquetes.*.valorDeclarado').optional({ nullable: true }).isFloat({ min: 1 }).withMessage('El valor declarado debe ser de al menos $1'),
  body('paquetes.*.tipoCarga')
    .notEmpty().withMessage('Debes indicar el tipo de carga')
    .isIn(['hierro', 'normal']).withMessage('Tipo de carga inválido. Opciones: hierro, normal'),
  body('paquetes.*.idRutaVehiculoConductor')
    .notEmpty().withMessage('Cada paquete debe tener un vehículo asignado')
    .isInt().withMessage('ID de vehículo/conductor de ruta debe ser un número entero'),
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