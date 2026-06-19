const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, message: 'Login exitoso', data: result });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
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
  getProfile,
  getConductorProfile,
  recuperarPassword,
  cambiarPassword
};