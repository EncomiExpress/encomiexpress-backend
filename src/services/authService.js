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

  // Mensaje genérico a propósito: no revela si el correo existe o no (evita
  // enumeración de correos registrados vía este endpoint público).
  if (!usuario) {
    throw new AppError('Correo o contraseña incorrectos', 401);
  }

  if (!usuario.habilitado) {
    throw new AppError('Tu cuenta está inhabilitada. Contacta al administrador.', 401);
  }

  if (usuario.rol && !usuario.rol.habilitado) {
    throw new AppError('El acceso para tu rol está inhabilitado. Contacta al administrador.', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, usuario.password);
  if (!isPasswordValid) {
    throw new AppError('Correo o contraseña incorrectos', 401);
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

const register = async (data) => {
  // Autoregistro público (sin login) — ver nota en authController.js. Se ignora a
  // propósito cualquier idRol/habilitado que venga en el body: todo autoregistro
  // queda con rol Administrador pero SIEMPRE inhabilitado y marcado como pendiente,
  // hasta que un admin ya activo lo habilite desde el módulo de Usuarios (eso limpia
  // registroPendiente, ver usuarioService.toggleHabilitado). Si se elimina esta
  // función en el futuro, también revisar authController.js y routes/auth.js.
  const { tipoIdentificacion, numeroIdentificacion, nombre, apellido, telefono, email, password } = data;

  const existingEmail = await Usuario.findOne({ where: { email } });
  if (existingEmail) {
    throw new AppError('El email ya está registrado', 400);
  }

  const existingDoc = await Usuario.findOne({ where: { numeroIdentificacion } });
  if (existingDoc) {
    throw new AppError('El número de identificación ya está registrado', 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const usuario = await Usuario.create({
    tipoIdentificacion,
    numeroIdentificacion,
    nombre,
    apellido,
    telefono,
    email,
    password: hashedPassword,
    idRol: 1,
    habilitado: false,
    registroPendiente: true,
  });

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    email: usuario.email,
    idRol: usuario.idRol,
    rol: 'usuario'
  });

  const rol = await Rol.findByPk(usuario.idRol, {
    include: [{ model: Permiso, as: 'permisos' }]
  });
  const permisos = rol?.permisos?.map(p => p.nombre) ?? [];

  return {
    token,
    usuario: {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      telefono: usuario.telefono,
      tipoIdentificacion: usuario.tipoIdentificacion,
      numeroIdentificacion: usuario.numeroIdentificacion,
      rol: 'usuario',
      permisos
    }
  };
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
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/resetear-password?token=${resetToken}`;

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
  register,
  refresh,
  getProfile,
  getConductorProfile,
  recuperarPassword,
  resetearPassword,
  cambiarPassword
};