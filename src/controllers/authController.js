const authService = require('../services/authService');
const { generateToken, verifyRefreshToken } = require('../middlewares/auth');
const { Usuario, Rol } = require('../models');

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

const recoverPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const { tempPassword } = await authService.recoverPassword(email);
    const { sendPasswordRecoveryEmail } = require('../config/email');
    await sendPasswordRecoveryEmail(email, tempPassword);
    res.json({ success: true, message: 'Se ha enviado una contraseña temporal a tu email' });
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token requerido' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    
    const usuario = await Usuario.findByPk(decoded.idUsuario, {
      include: [{ model: Rol, as: 'rol' }]
    });

    if (!usuario || !usuario.habilitado) {
      return res.status(401).json({ success: false, message: 'Usuario no válido' });
    }

    const newToken = generateToken({ 
      idUsuario: usuario.idUsuario, 
      email: usuario.email, 
      rol: usuario.rol?.nombre 
    });

    res.json({ success: true, data: { token: newToken } });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Refresh token inválido o expirado' });
  }
};

module.exports = {
  login,
  register,
  getProfile,
  getConductorProfile,
  refreshToken,
  recoverPassword
};
