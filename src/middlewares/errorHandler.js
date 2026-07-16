const AppError = require('../errors/appError');

const handleJWTError = () => new AppError('Token inválido. Por favor, inicia sesión de nuevo.', 401);
const handleJWTExpiredError = () => new AppError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.', 401);
const handleSequelizeUniqueError = () => new AppError('El registro ya existe', 409);
const handleSequelizeForeignKeyError = () => new AppError('Referencia inválida a otro registro', 400);
// err (no el "error" ya spreadeado) porque err.errors es la lista real de validaciones que trae Sequelize
const handleSequelizeValidationError = (err) => new AppError(err.errors.map(e => e.message).join(', '), 400);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
    ...(err.errorCode && { errorCode: err.errorCode }),
    ...(err.details && { details: err.details }),
    error: err,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errorCode && { errorCode: err.errorCode }),
      ...(err.details && { details: err.details }),
    });
  } else {
    console.error('ERROR 💥', { statusCode: err.statusCode, message: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      message: 'Ocurrió un error inesperado. Intenta de nuevo en un momento.',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Error interno del servidor';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    if (error.name === 'SequelizeUniqueConstraintError') error = handleSequelizeUniqueError();
    if (error.name === 'SequelizeForeignKeyConstraintError') error = handleSequelizeForeignKeyError();
    if (error.name === 'SequelizeValidationError') error = handleSequelizeValidationError(err);

    sendErrorProd(error, res);
  }
};
