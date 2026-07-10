const authService = require('../services/authService');
const AppError = require('../errors/appError');

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, message: 'Login exitoso', data: result });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError('Refresh token requerido', 400));
    const result = await authService.refresh(refreshToken);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    // Autoregistro público sin login (usado por la página /register del frontend,
    // pensada para que el personal administrativo se autoregistre sin que un admin
    // tenga que digitar sus datos). A propósito NO se bloquea en producción como sí
    // hace /api/seed: authService.register() SIEMPRE fuerza habilitado=false,
    // registroPendiente=true e idRol=1 (admin) sin importar lo que mande el cliente,
    // así que una cuenta creada por aquí no puede iniciar sesión hasta que un
    // administrador ya activo la habilite (botón "Habilitar") desde el módulo de
    // Usuarios — eso limpia registroPendiente. Ese mismo módulo también permite
    // "Ignorar" una solicitud (deja la cuenta inhabilitada sin la marca de pendiente,
    // sin habilitarla). El registro normal de usuarios (POST /api/usuarios, protegido,
    // requiere login + permiso registrar_usuario) no pasa por aquí y siempre crea
    // usuarios ya habilitados con el rol que el admin elija.
    const data = req.body;
    const result = await authService.register(data);
    res.status(201).json({ success: true, message: 'Usuario registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const usuario = await authService.getProfile(req.usuario.idUsuario);
    res.json({ success: true, data: usuario });
  } catch (error) {
    next(error);
  }
};

const getConductorProfile = async (req, res, next) => {
  try {
    const conductor = await authService.getConductorProfile(req.usuario.idUsuario, req.usuario.rol?.nombre);
    res.json({ success: true, data: conductor });
  } catch (error) {
    next(error);
  }
};

const recuperarPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const { tempPassword } = await authService.recuperarPassword(email);
    const { sendPasswordRecoveryEmail } = require('../config/email');
    await sendPasswordRecoveryEmail(email, tempPassword);
    res.json({ success: true, message: 'Se ha enviado una contraseña temporal a tu email' });
  } catch (error) {
    next(error);
  }
};

const cambiarPassword = async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body;
    const email = req.usuario?.email;
    await authService.cambiarPassword(email, passwordActual, passwordNueva);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  register,
  refresh,
  getProfile,
  getConductorProfile,
  recuperarPassword,
  cambiarPassword
};