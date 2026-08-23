const bcrypt = require('bcryptjs');
const { Usuario, Rol, Permiso, Conductor } = require('../models');
const { generateToken, generateRefreshToken, verifyRefreshToken, generateResetPasswordToken, verifyResetPasswordToken } = require('../middlewares/auth');
const AppError = require('../errors/appError');

const login = async (email, password) => {
  if (!email || !password) {
    throw new AppError('Email y password son requeridos', 400);
  }

  const usuario = await Usuario.findOne({
    where: { email },
    include: [{
      model: Rol,
      as: 'rol',
      include: [{ model: Permiso, as: 'permisos' }]
    }]
  });

  // Mensaje genérico a propósito en TODAS las ramas de fallo (usuario inexistente,
  // contraseña incorrecta, cuenta inhabilitada o rol inhabilitado): evita que un
  // atacante use el mensaje de error para confirmar si un correo está registrado
  // en el sistema o en qué estado se encuentra su cuenta. La contraseña se verifica
  // antes que el estado de la cuenta/rol por la misma razón: si se verificara el
  // estado primero, una cuenta inhabilitada seguiría respondiendo distinto a una
  // cuenta habilitada con contraseña incorrecta.
  const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos';

  if (!usuario) {
    throw new AppError(CREDENCIALES_INVALIDAS, 401);
  }

  const isPasswordValid = await bcrypt.compare(password, usuario.password);
  if (!isPasswordValid) {
    throw new AppError(CREDENCIALES_INVALIDAS, 401);
  }

  if (!usuario.habilitado) {
    throw new AppError(CREDENCIALES_INVALIDAS, 401);
  }

  if (usuario.rol && !usuario.rol.habilitado) {
    throw new AppError(CREDENCIALES_INVALIDAS, 401);
  }

  const permisos = usuario.rol?.permisos?.map(p => p.nombre) ?? [];

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    idRol: usuario.idRol,
    rol: usuario.rol?.nombre ?? null
  });

  const refreshToken = generateRefreshToken({
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    idRol: usuario.idRol
  });

  let conductorData = null;
  if (usuario.rol?.nombre === 'conductor') {
    const conductor = await Conductor.findOne({
      where: { idUsuario: usuario.idUsuario }
    });

    if (conductor) {
      conductorData = {
        idConductor: conductor.idConductor,
        categoriasLicencia: conductor.categoriasLicencia,
        numeroLicencia: conductor.numeroLicencia,
        estado: conductor.estado,
        habilitado: conductor.habilitado
      };
    }
  }

  return {
    token,
    refreshToken,
    usuario: {
      idUsuario: usuario.idUsuario,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      telefono: usuario.telefono,
      tipoIdentificacion: usuario.tipoIdentificacion,
      numeroIdentificacion: usuario.numeroIdentificacion,
      rol: usuario.rol?.nombre ?? null,
      permisos
    },
    conductor: conductorData
  };
};

const refresh = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Refresh token inválido o expirado. Inicia sesión nuevamente.', 401);
  }

  const usuario = await Usuario.findByPk(decoded.idUsuario, {
    include: [{ model: Rol, as: 'rol' }]
  });

  if (!usuario) throw new AppError('Usuario no encontrado', 401);
  if (!usuario.habilitado) throw new AppError('Tu cuenta está inhabilitada. Contacta al administrador.', 401);
  if (usuario.rol && !usuario.rol.habilitado) throw new AppError('El acceso para tu rol está inhabilitado. Contacta al administrador.', 401);

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    idRol: usuario.idRol,
    rol: usuario.rol?.nombre ?? null
  });

  return { token };
};

const getProfile = async (idUsuario) => {
  const usuario = await Usuario.findByPk(idUsuario, {
    include: [{
      model: Rol,
      as: 'rol',
      include: [{ model: Permiso, as: 'permisos' }]
    }],
    attributes: { exclude: ['password'] }
  });

  if (!usuario) {
    throw new AppError('Usuario no encontrado', 404);
  }

  const permisos = usuario.rol?.permisos?.map(p => p.nombre) ?? [];

  return {
    idUsuario: usuario.idUsuario,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    telefono: usuario.telefono,
    tipoIdentificacion: usuario.tipoIdentificacion,
    numeroIdentificacion: usuario.numeroIdentificacion,
    rol: usuario.rol?.nombre ?? null,
    permisos
  };
};

const getConductorProfile = async (idUsuario, rolNombre) => {
  if (rolNombre !== 'conductor') {
    throw new AppError('Acceso denegado. Solo los conductores pueden acceder a este recurso', 403);
  }

  const conductor = await Conductor.findOne({
    where: { idUsuario },
    include: [{ model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } }]
  });

  if (!conductor) {
    throw new AppError('Conductor no encontrado', 404);
  }

  return {
    nombre: conductor.usuario.nombre,
    apellido: conductor.usuario.apellido,
    telefono: conductor.usuario.telefono,
    tipoIdentificacion: conductor.usuario.tipoIdentificacion,
    numeroIdentificacion: conductor.usuario.numeroIdentificacion,
    idConductor: conductor.idConductor,
    categoriasLicencia: conductor.categoriasLicencia,
    numeroLicencia: conductor.numeroLicencia,
    estado: conductor.estado,
    habilitado: conductor.habilitado,
    rol: conductor.usuario.rol?.nombre
  };
};

const recuperarPassword = async (email) => {
  if (!email) {
    throw new AppError('Email es requerido', 400);
  }

  const usuario = await Usuario.findOne({ where: { email } });

  // No revela si el correo existe o no — misma respuesta en ambos casos.
  if (!usuario) {
    return;
  }

  // El sello (fragmento del hash actual) invalida el token solo con que la
  // contraseña cambie — hace el enlace de un solo uso sin guardarlo en la BD.
  const resetToken = generateResetPasswordToken({
    idUsuario: usuario.idUsuario,
    sello: usuario.password.slice(-10),
  });
  // FRONTEND_URLS puede traer varios dominios separados por coma (misma variable que
  // usa el CORS en app.js) — el correo solo necesita uno, se toma el primero.
  const frontendUrl = process.env.FRONTEND_URLS?.split(',')[0]?.trim() || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/resetear-password?token=${resetToken}`;

  const { sendPasswordRecoveryEmail } = require('../config/email');
  await sendPasswordRecoveryEmail(email, resetUrl);
};

const resetearPassword = async (token, passwordNueva) => {
  if (!token || !passwordNueva) {
    throw new AppError('Token y nueva contraseña son requeridos', 400);
  }

  let decoded;
  try {
    decoded = verifyResetPasswordToken(token);
  } catch {
    throw new AppError('El enlace no es válido o ya venció. Solicita uno nuevo.', 400);
  }

  const usuario = await Usuario.findByPk(decoded.idUsuario);
  if (!usuario) {
    throw new AppError('El enlace no es válido o ya venció. Solicita uno nuevo.', 400);
  }

  if (usuario.password.slice(-10) !== decoded.sello) {
    // La contraseña ya cambió desde que se generó el enlace — no se reutiliza.
    throw new AppError('Este enlace ya fue usado. Solicita uno nuevo.', 400);
  }

  const hashedPassword = await bcrypt.hash(passwordNueva, 10);
  await usuario.update({ password: hashedPassword });
};

const cambiarPassword = async (email, passwordActual, passwordNueva) => {
  if (!passwordActual || !passwordNueva) {
    throw new AppError('Contraseña actual y contraseña nueva son requeridas', 400);
  }

  if (!email) {
    throw new AppError('No se pudo identificar el usuario', 401);
  }

  const usuario = await Usuario.findOne({ where: { email } });

  if (!usuario) {
    throw new AppError('No existe usuario con ese email', 404);
  }

  const isValid = await bcrypt.compare(passwordActual, usuario.password);
  if (!isValid) {
    throw new AppError('La contraseña actual es incorrecta', 400);
  }

  if (passwordActual === passwordNueva) {
    throw new AppError('La nueva contraseña debe ser diferente a la actual', 400);
  }

  const hashedPassword = await bcrypt.hash(passwordNueva, 10);
  await usuario.update({ password: hashedPassword });
};

module.exports = {
  login,
  refresh,
  getProfile,
  getConductorProfile,
  recuperarPassword,
  resetearPassword,
  cambiarPassword
};