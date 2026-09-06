const { body } = require('express-validator');

// Debe coincidir con PASSWORD_REGEX en encomiexpress-frontend/src/shared/components/Header.jsx
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,64}$/;
const PASSWORD_MESSAGE = 'La contraseña debe tener 8-64 caracteres, con mayúsculas, minúsculas, números y un carácter especial';

// Debe coincidir con SOLO_LETRAS_REGEX en RegistrarCliente.jsx/RegistrarPropietario.jsx/etc.
// No aplica cuando tipoIdentificacion === 'NIT' (razón social: puede tener números/símbolos).
const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/;
// Debe coincidir con esSoloRelleno en shared/utils/formatters.js. SOLO_LETRAS_REGEX permite
// \s (para nombres con espacio, ej. "Ana María"), así que un valor de puros espacios lo
// pasaba igual — este chequeo aparte lo bloquea, sin importar si aplica o no el caso NIT.
const soloRelleno = (value) => /^[\s\-_]*$/.test(value ?? '');

// Formato de dirección — réplica de shared/validations/direccionValidation.js del
// frontend. Permitido: letras (tildes/ñ/ü), números, espacios y los signos # - . , /
// (nomenclatura colombiana: "Cl. 10 # 5-12", "Calle 45 / Carrera 50", "Apto. 302, Bloque 4").
// Prohíbe $ % & * = ¿ ? ¡ ! " ' etc., y que empiece con espacio o símbolo.
const DIRECCION_REGEX = /^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s#.,/-]+$/;
const DIRECCION_INICIO_REGEX = /^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ]/;
const validarDireccionFormato = (value) => {
  if (value == null || value === '') return true;
  if (/^\s/.test(value)) throw new Error('La dirección no puede empezar con un espacio');
  const v = String(value).trim();
  if (!v) throw new Error('La dirección no puede contener solo espacios');
  if (soloRelleno(v)) throw new Error('La dirección no puede contener solo espacios o guiones');
  if (!DIRECCION_INICIO_REGEX.test(v)) throw new Error('La dirección debe empezar con una letra o un número');
  if (!DIRECCION_REGEX.test(v)) throw new Error('La dirección solo admite letras, números, espacios y los signos # - . , /');
  return true;
};

// Formato de "descripción del contenido" de un paquete — réplica de
// shared/validations/descripcionContenidoValidation.js del frontend. Permitido: letras
// (tildes/ñ/ü), números, espacios y  * , . - /  ("Zapatos x3", "Motor 2.0",
// "Ropa de hombre/mujer"). Prohíbe _ + = ^ $ % & @ ~ | ¡ ! ¿ ? " ' etc., y que empiece
// con espacio o símbolo.
const DESCRIPCION_CONTENIDO_REGEX = /^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s.,*/-]+$/;
const validarDescripcionContenidoFormato = (value) => {
  if (value == null || value === '') return true;
  if (/^\s/.test(value)) throw new Error('La descripción no puede empezar con un espacio');
  const v = String(value).trim();
  if (!v) throw new Error('La descripción no puede contener solo espacios');
  if (soloRelleno(v)) throw new Error('La descripción no puede contener solo espacios o guiones');
  if (!DIRECCION_INICIO_REGEX.test(v)) throw new Error('La descripción debe empezar con una letra o un número');
  if (!DESCRIPCION_CONTENIDO_REGEX.test(v)) throw new Error('La descripción solo admite letras, números, espacios y los signos . , - / *');
  return true;
};

// Formato de "Observaciones" de una Ruta — réplica de
// shared/validations/observacionesRutaValidation.js del frontend. Más flexible que la
// descripción de contenido: letras (tildes/ñ/ü), números, espacios y  # - / . , : ; ( ) $
// ("Cobro $50.000 en destino", "Tel 300-555-1122"). Prohíbe ^ + = _ ~ | < > etc.
const OBSERVACIONES_RUTA_REGEX = /^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ\s#/.,:;()$-]+$/;
const validarObservacionesRutaFormato = (value) => {
  if (value == null || value === '') return true;
  const v = String(value);
  if (!v.trim()) throw new Error('Las observaciones no pueden contener solo espacios');
  if (soloRelleno(v)) throw new Error('Las observaciones no pueden contener solo espacios o guiones');
  if (!OBSERVACIONES_RUTA_REGEX.test(v)) throw new Error('Las observaciones tienen caracteres no permitidos (evita ^ + = _ ~ | < >)');
  return true;
};

// Tipos de documento — universo completo conocido por el sistema (usado por
// REGLAS_DOC de abajo para el formato del número). TI y RC (Tarjeta de Identidad /
// Registro Civil, documentos de menores de edad) no se incluyen: ningún módulo los
// deja elegir -- ver TIPOS_DOC_* más abajo y LOGICA.md ("Tipos de documento por
// módulo") -- mantenerlos acá sería código muerto sin ninguna función, un menor de
// edad no puede ser conductor, propietario de vehículo, empleado del sistema, ni
// remitente/destinatario de una encomienda.
const TIPOS_DOC_TODOS = ['CC', 'CE', 'PAS', 'NIT', 'PPT'];

// Tipos permitidos por módulo — réplica exacta de los TIPOS_DOC_PERMITIDOS del
// frontend (usuarioValidation.js/conductorValidation.js/propietarioValidation.js/
// clienteValidation.js/ventas/validations/validacion.js).
const TIPOS_DOC_USUARIO = ['CC', 'CE', 'PPT'];
const TIPOS_DOC_CONDUCTOR = ['CC', 'CE', 'PPT'];
const TIPOS_DOC_PROPIETARIO = ['CC', 'NIT', 'CE', 'PAS'];
const TIPOS_DOC_CLIENTE = ['CC', 'NIT', 'CE', 'PAS', 'PPT'];

// Reglas de número de documento por tipo — réplica de REGLAS_DOCUMENTO en
// encomiexpress-frontend/src/shared/utils/documento.js (CC 7-10 dígitos, CE 1-12
// alfanumérico, PAS 1-20 alfanumérico, PPT 6-10 solo dígitos) + el caso especial NIT
// (dígitos y guion, ≤15, ≥1 dígito), que en el front vive en
// clienteValidation.js/propietarioValidation.js.
// Devuelve el mensaje de error o null si es válido.
const REGLAS_DOC = {
  CC: { min: 7, max: 10 },
  CE: { min: 1, max: 12, alfa: true },
  PAS: { min: 1, max: 20, alfa: true },
  PPT: { min: 6, max: 10 },
};
const validarNumeroDoc = (tipo, valor) => {
  const v = String(valor ?? '').trim();
  if (!v) return 'El número de identificación es requerido';
  if (soloRelleno(v)) return 'El número de identificación no puede contener solo espacios o guiones';
  if (tipo === 'NIT') {
    if (!/^[0-9-]+$/.test(v)) return 'El NIT solo puede tener números y guion';
    if (!/\d/.test(v)) return 'El NIT debe contener al menos un número';
    if (v.length > 15) return 'El NIT no puede exceder 15 caracteres';
    return null;
  }
  const regla = REGLAS_DOC[tipo];
  if (!regla) return null; // tipo desconocido → lo bloquea la regla de tipoIdentificacion
  if (regla.alfa) {
    if (!/^[a-zA-Z0-9]+$/.test(v)) return 'El documento solo puede tener letras y números';
  } else if (!/^\d+$/.test(v)) {
    return 'El documento solo puede tener dígitos';
  }
  if (v.length < regla.min || v.length > regla.max) {
    const u = regla.alfa ? 'caracteres' : 'dígitos';
    return regla.min === regla.max
      ? `El documento debe tener exactamente ${regla.min} ${u}`
      : `El documento debe tener entre ${regla.min} y ${regla.max} ${u}`;
  }
  return null;
};

// Celulares colombianos: exactamente 10 dígitos, siempre empiezan por 3.
const TELEFONO_REGEX = /^3\d{9}$/;

// Teléfono internacional — para CE, Pasaporte y PPT se permite conservar el prefijo
// del país de origen o una línea de WhatsApp del exterior. '+' opcional y de 7 a 15
// dígitos (rango E.164); acepta también un celular colombiano de 10 dígitos, así que
// es superconjunto del caso nacional. **CC y NIT** quedan obligados a celular
// colombiano. Réplica de shared/validations/telefonoValidation.js del frontend.
const TELEFONO_INTL_REGEX = /^\+?\d{7,15}$/;
const TIPOS_DOC_TELEFONO_INTL = ['CE', 'PAS', 'PPT'];
// Devuelve el mensaje de error o null. Para los tipos de arriba acepta formato
// internacional; para CC/NIT exige el celular colombiano (10 dígitos, empieza por 3).
const validarTelefonoPorTipo = (valor, tipoIdentificacion) => {
  const v = String(valor ?? '').trim();
  if (TIPOS_DOC_TELEFONO_INTL.includes(tipoIdentificacion)) {
    if (!TELEFONO_INTL_REGEX.test(v)) return 'Teléfono inválido. Si es del exterior, usa el prefijo de país (ej: +584121234567)';
    return null;
  }
  if (!TELEFONO_REGEX.test(v)) return 'El teléfono debe tener 10 dígitos y empezar por 3';
  return null;
};

// NIT estricto: 9 dígitos de raíz + guion + 1 dígito de verificación (ej. 123456789-0).
// Réplica de validarDocumentoCompleto (rama NIT) en propietarioValidation.js del
// frontend. Hoy solo lo usa Propietario -- Cliente/destinatario de Venta siguen con el
// NIT laxo de validarNumeroDoc (dígitos+guion ≤15); ver LOGICA.md.
const validarNitEstricto = (valor) => {
  const v = String(valor ?? '').trim();
  if (!v) return 'El NIT es requerido';
  if (soloRelleno(v)) return 'El NIT no puede contener solo espacios o guiones';
  if (!/^\d{9}-\d$/.test(v)) return 'El NIT debe tener 9 dígitos y el dígito de verificación (ej: 123456789-0)';
  return null;
};

module.exports = {
  PASSWORD_REGEX,
  PASSWORD_MESSAGE,
  soloRelleno,
  validarDireccionFormato,
  validarDescripcionContenidoFormato,
  validarObservacionesRutaFormato,
  validarNumeroDoc,
  validarNitEstricto,
  validarTelefonoPorTipo,
  TIPOS_DOC_USUARIO,
  TIPOS_DOC_CONDUCTOR,
  TIPOS_DOC_PROPIETARIO,
  TIPOS_DOC_CLIENTE,
  tipoIdentificacion: {
    // tiposPermitidos: lista de tipos que este módulo deja elegir (ver TIPOS_DOC_* de
    // arriba) -- por defecto acepta el universo completo, para no romper un llamador
    // que aún no pase una lista explícita.
    required: (tiposPermitidos = TIPOS_DOC_TODOS) => body('tipoIdentificacion').notEmpty().withMessage('Tipo de identificación es requerido')
      .isIn(tiposPermitidos).withMessage(`Tipo de identificación inválido. Opciones: ${tiposPermitidos.join(', ')}`),
    optional: (tiposPermitidos = TIPOS_DOC_TODOS) => body('tipoIdentificacion').optional().notEmpty().withMessage('Tipo de identificación no puede estar vacío')
      .isIn(tiposPermitidos).withMessage(`Tipo de identificación inválido. Opciones: ${tiposPermitidos.join(', ')}`),
  },
  numeroIdentificacion: {
    // validarNit: validador estricto opcional para cuando tipoIdentificacion === 'NIT'
    // (Propietario y Cliente pasan r.validarNitEstricto; encomiendasValidator.js lo
    // llama aparte para el destinatario, sin pasar por este parámetro, porque su NIT
    // vive en un sub-objeto "destinatario". Usuario/Conductor no pasan nada -- no
    // aceptan NIT). Ver LOGICA.md.
    required: (validarNit = null) => body('numeroIdentificacion').notEmpty().withMessage('Número de identificación es requerido')
      .bail()
      .custom((value, { req }) => {
        const tipo = req.body.tipoIdentificacion;
        const err = (validarNit && tipo === 'NIT') ? validarNit(value) : validarNumeroDoc(tipo, value);
        if (err) throw new Error(err);
        return true;
      }),
    optional: (validarNit = null) => body('numeroIdentificacion').optional().notEmpty().withMessage('Número de identificación no puede estar vacío')
      .bail()
      .custom((value, { req }) => {
        const tipo = req.body.tipoIdentificacion;
        const err = (validarNit && tipo === 'NIT') ? validarNit(value) : validarNumeroDoc(tipo, value);
        if (err) throw new Error(err);
        return true;
      }),
  },
  nombre: {
    required: () => body('nombre').notEmpty().withMessage('Nombre es requerido')
      .custom((value, { req }) => {
        if (soloRelleno(value)) throw new Error('El nombre no puede contener solo espacios');
        if (String(value).length > 50) throw new Error('El nombre no puede exceder 50 caracteres');
        if (req.body.tipoIdentificacion === 'NIT') return true;
        if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El nombre solo puede contener letras');
        return true;
      }),
    optional: () => body('nombre').optional().custom((value, { req }) => {
      if (!value) return true;
      if (soloRelleno(value)) throw new Error('El nombre no puede contener solo espacios');
      if (String(value).length > 50) throw new Error('El nombre no puede exceder 50 caracteres');
      if (req.body.tipoIdentificacion === 'NIT') return true;
      if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El nombre solo puede contener letras');
      return true;
    }),
  },
  apellido: {
    // Las personas jurídicas (NIT) no tienen apellido: solo razón social en "nombre"
    required: () => body('apellido').custom((value, { req }) => {
      if (req.body.tipoIdentificacion === 'NIT') return true;
      if (!value || !String(value).trim()) throw new Error('Apellido es requerido');
      if (soloRelleno(value)) throw new Error('El apellido no puede contener solo espacios');
      if (String(value).length > 50) throw new Error('El apellido no puede exceder 50 caracteres');
      if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El apellido solo puede contener letras');
      return true;
    }),
    optional: () => body('apellido').optional().custom((value, { req }) => {
      if (!value || req.body.tipoIdentificacion === 'NIT') return true;
      if (soloRelleno(value)) throw new Error('El apellido no puede contener solo espacios');
      if (String(value).length > 50) throw new Error('El apellido no puede exceder 50 caracteres');
      if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El apellido solo puede contener letras');
      return true;
    }),
  },
  telefono: {
    // El formato depende del tipoIdentificacion del titular: celular colombiano por
    // defecto, internacional si el documento es de extranjero (CE / Pasaporte).
    required: () => body('telefono').notEmpty().withMessage('El teléfono es requerido')
      .bail()
      .custom((value, { req }) => {
        const err = validarTelefonoPorTipo(value, req.body.tipoIdentificacion);
        if (err) throw new Error(err);
        return true;
      }),
    optional: () => body('telefono').optional({ checkFalsy: true })
      .custom((value, { req }) => {
        const err = validarTelefonoPorTipo(value, req.body.tipoIdentificacion);
        if (err) throw new Error(err);
        return true;
      }),
  },
  email: {
    required: () => body('email').isEmail().withMessage('Email inválido')
      .bail().isLength({ max: 100 }).withMessage('El correo no puede exceder 100 caracteres'),
    optional: () => body('email').optional().isEmail().withMessage('Email inválido')
      .bail().isLength({ max: 100 }).withMessage('El correo no puede exceder 100 caracteres'),
  },
  password: {
    required: () => body('password').matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
    optional: () => body('password').optional().matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
  },
  habilitado: {
    optional: () => body('habilitado').optional().isBoolean().withMessage('El campo habilitado debe ser booleano'),
  },
};
