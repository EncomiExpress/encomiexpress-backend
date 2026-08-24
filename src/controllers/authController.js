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
    await authService.recuperarPassword(email);
    // Mismo mensaje exista o no el correo — ver nota en authService.recuperarPassword.
    res.json({ success: true, message: 'En caso de que el correo esté registrado, se le enviará un enlace para recuperar su contraseña' });
  } catch (error) {
    next(error);
  }
};

const resetearPassword = async (req, res, next) => {
  try {
    const { token, passwordNueva } = req.body;
    await authService.resetearPassword(token, passwordNueva);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
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
  refresh,
  getProfile,
  getConductorProfile,
  recuperarPassword,
  resetearPassword,
  cambiarPassword
};