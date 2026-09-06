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
  body('total').optional().isFloat({ min: 0, max: 9999999 }).withMessage('El total a pagar debe estar entre 0 y 9.999.999'),
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
  body('destinatario.telefonoDestinatario')
    .notEmpty().withMessage('El teléfono del destinatario es obligatorio')
    .bail()
    .custom((value, { req }) => {
      const err = r.validarTelefonoPorTipo(value, req.body.destinatario?.tipoIdentificacionDestinatario);
      if (err) throw new Error(err);
      return true;
    }),
  body('destinatario.tipoIdentificacionDestinatario')
    .notEmpty().withMessage('El tipo de documento del destinatario es obligatorio')
    .isIn(r.TIPOS_DOC_CLIENTE).withMessage(`Tipo de documento inválido. Opciones: ${r.TIPOS_DOC_CLIENTE.join(', ')}`),
  body('destinatario.numeroIdentificacionDestinatario')
    .notEmpty().withMessage('El número de documento del destinatario es obligatorio')
    .isLength({ max: 20 }).withMessage('El número de documento del destinatario es demasiado largo')
    .custom(noSoloRelleno('El número de documento no puede contener solo espacios o guiones'))
    .bail()
    .custom((value, { req }) => {
      const tipo = req.body.destinatario?.tipoIdentificacionDestinatario;
      const err = tipo === 'NIT' ? r.validarNitEstricto(value) : r.validarNumeroDoc(tipo, value);
      if (err) throw new Error(err);
      return true;
    }),
  body('destinatario.idDestino')
    .notEmpty().withMessage('El municipio de destino del destinatario es obligatorio')
    .isInt().withMessage('ID de destino debe ser un número entero'),
  body('destinatario.correoDestinatario')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('El correo del destinatario no es válido')
    .isLength({ max: 150 }).withMessage('El correo del destinatario es demasiado largo'),
  body('destinatario.direccionDestinatario')
    .notEmpty().withMessage('La dirección del destinatario es obligatoria')
    .bail()
    .isLength({ max: 300 }).withMessage('La dirección no puede exceder 300 caracteres')
    .custom(r.validarDireccionFormato),
  body('paquetes').isArray({ min: 1 }).withMessage('Debe registrar al menos un paquete'),
  body('paquetes.*.descripcionContenido')
    .notEmpty().withMessage('La descripción del paquete es obligatoria')
    .bail()
    .isLength({ max: 300 }).withMessage('Máximo 300 caracteres')
    .custom(r.validarDescripcionContenidoFormato),
  body('paquetes.*.peso')
    .notEmpty().withMessage('El peso del paquete es obligatorio')
    .isFloat({ min: 1, max: 999 }).withMessage('El peso del paquete debe estar entre 1 y 999 kg'),
  body('paquetes.*.alto').optional({ nullable: true }).isFloat({ min: 1, max: 999 }).withMessage('El alto del paquete debe estar entre 1 y 999 cm'),
  body('paquetes.*.ancho').optional({ nullable: true }).isFloat({ min: 1, max: 999 }).withMessage('El ancho del paquete debe estar entre 1 y 999 cm'),
  body('paquetes.*.profundidad').optional({ nullable: true }).isFloat({ min: 1, max: 999 }).withMessage('La profundidad del paquete debe estar entre 1 y 999 cm'),
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
  body('total').optional().isFloat({ min: 0, max: 9999999 }).withMessage('El total a pagar debe estar entre 0 y 9.999.999'),
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
  body('destinatario.telefonoDestinatario')
    .if(body('destinatario').exists())
    .notEmpty().withMessage('El teléfono del destinatario es obligatorio')
    .bail()
    .custom((value, { req }) => {
      const err = r.validarTelefonoPorTipo(value, req.body.destinatario?.tipoIdentificacionDestinatario);
      if (err) throw new Error(err);
      return true;
    }),
  body('destinatario.tipoIdentificacionDestinatario')
    .if(body('destinatario').exists())
    .notEmpty().withMessage('El tipo de documento del destinatario es obligatorio')
    .isIn(r.TIPOS_DOC_CLIENTE).withMessage(`Tipo de documento inválido. Opciones: ${r.TIPOS_DOC_CLIENTE.join(', ')}`),
  body('destinatario.numeroIdentificacionDestinatario')
    .if(body('destinatario').exists())
    .notEmpty().withMessage('El número de documento del destinatario es obligatorio')
    .isLength({ max: 20 }).withMessage('El número de documento del destinatario es demasiado largo')
    .custom(noSoloRelleno('El número de documento no puede contener solo espacios o guiones'))
    .bail()
    .custom((value, { req }) => {
      const tipo = req.body.destinatario?.tipoIdentificacionDestinatario;
      const err = tipo === 'NIT' ? r.validarNitEstricto(value) : r.validarNumeroDoc(tipo, value);
      if (err) throw new Error(err);
      return true;
    }),
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
    .bail()
    .isLength({ max: 300 }).withMessage('La dirección no puede exceder 300 caracteres')
    .custom(r.validarDireccionFormato),
  body('paquetes').optional().isArray({ min: 1 }).withMessage('Debe registrar al menos un paquete'),
  body('paquetes.*.descripcionContenido')
    .notEmpty().withMessage('La descripción del paquete es obligatoria')
    .bail()
    .isLength({ max: 300 }).withMessage('Máximo 300 caracteres')
    .custom(r.validarDescripcionContenidoFormato),
  body('paquetes.*.peso')
    .notEmpty().withMessage('El peso del paquete es obligatorio')
    .isFloat({ min: 1, max: 999 }).withMessage('El peso del paquete debe estar entre 1 y 999 kg'),
  body('paquetes.*.alto').optional({ nullable: true }).isFloat({ min: 1, max: 999 }).withMessage('El alto del paquete debe estar entre 1 y 999 cm'),
  body('paquetes.*.ancho').optional({ nullable: true }).isFloat({ min: 1, max: 999 }).withMessage('El ancho del paquete debe estar entre 1 y 999 cm'),
  body('paquetes.*.profundidad').optional({ nullable: true }).isFloat({ min: 1, max: 999 }).withMessage('La profundidad del paquete debe estar entre 1 y 999 cm'),
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