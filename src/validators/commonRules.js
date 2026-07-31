const { body } = require('express-validator');

// Debe coincidir con PASSWORD_REGEX en encomiexpress-frontend/src/shared/components/Header.jsx
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9\s]).{8,64}$/;
const PASSWORD_MESSAGE = 'La contraseña debe tener 8-64 caracteres, con mayúsculas, minúsculas, números y un carácter especial';

// Debe coincidir con SOLO_LETRAS_REGEX en RegistrarCliente.jsx/RegistrarPropietario.jsx/etc.
// No aplica cuando tipoIdentificacion === 'NIT' (razón social: puede tener números/símbolos).
const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

module.exports = {
  PASSWORD_REGEX,
  PASSWORD_MESSAGE,
  tipoIdentificacion: {
    required: () => body('tipoIdentificacion').notEmpty().withMessage('Tipo de identificación es requerido'),
    optional: () => body('tipoIdentificacion').optional().notEmpty().withMessage('Tipo de identificación no puede estar vacío'),
  },
  numeroIdentificacion: {
    required: () => body('numeroIdentificacion').notEmpty().withMessage('Número de identificación es requerido'),
    optional: () => body('numeroIdentificacion').optional().notEmpty().withMessage('Número de identificación no puede estar vacío'),
  },
  nombre: {
    required: () => body('nombre').notEmpty().withMessage('Nombre es requerido')
      .custom((value, { req }) => {
        if (req.body.tipoIdentificacion === 'NIT') return true;
        if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El nombre solo puede contener letras');
        return true;
      }),
    optional: () => body('nombre').optional().custom((value, { req }) => {
      if (!value || req.body.tipoIdentificacion === 'NIT') return true;
      if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El nombre solo puede contener letras');
      return true;
    }),
  },
  apellido: {
    // Las personas jurídicas (NIT) no tienen apellido: solo razón social en "nombre"
    required: () => body('apellido').custom((value, { req }) => {
      if (req.body.tipoIdentificacion === 'NIT') return true;
      if (!value || !String(value).trim()) throw new Error('Apellido es requerido');
      if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El apellido solo puede contener letras');
      return true;
    }),
    optional: () => body('apellido').optional().custom((value, { req }) => {
      if (!value || req.body.tipoIdentificacion === 'NIT') return true;
      if (!SOLO_LETRAS_REGEX.test(value)) throw new Error('El apellido solo puede contener letras');
      return true;
    }),
  },
  telefono: {
    optional: () => body('telefono').optional().isMobilePhone().withMessage('Teléfono inválido'),
  },
  email: {
    required: () => body('email').isEmail().withMessage('Email inválido'),
    optional: () => body('email').optional().isEmail().withMessage('Email inválido'),
  },
  password: {
    required: () => body('password').matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
    optional: () => body('password').optional().matches(PASSWORD_REGEX).withMessage(PASSWORD_MESSAGE),
  },
  habilitado: {
    optional: () => body('habilitado').optional().isBoolean().withMessage('El campo habilitado debe ser booleano'),
  },
};
