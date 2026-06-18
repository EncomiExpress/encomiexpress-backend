const jwt = require('jsonwebtoken');
const { Usuario, Rol, Permiso } = require('../models');
const AppError = require('../errors/appError');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('No se proporcionó token de autenticación', 401));
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decodificado:', decoded);

    const usuario = await Usuario.findByPk(decoded.idUsuario, {
      include: [
        { model: Rol, as: 'rol', include: [{ model: Permiso, as: 'permisos' }] }
      ]
    });

    if (!usuario) {
      return next(new AppError('Usuario no encontrado', 401));
    }

    if (!usuario.habilitado) {
      return next(new AppError('Usuario deshabilitado', 401));
    }

    req.usuario = usuario;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token inválido', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expirado', 401));
    }
    next(error);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    if (!roles.includes(req.usuario.rol?.nombre)) {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para esta acción'
      });
    }

    next();
  };
};

const authorizePermission = (permiso) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    const permisos = req.usuario.rol?.permisos?.map(p => p.nombre);

    if (!permisos?.includes(permiso)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado'
      });
    }

    next();
  };
};

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  authenticate,
  authorize,
  authorizePermission,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};