const AppError = require('../errors/appError');

const handleJWTError = () => new AppError('Token inválido. Por favor, inicia sesión de nuevo.', 401);
const handleJWTExpiredError = () => new AppError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.', 401);

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
      message: 'Algo salió muy mal',
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

    sendErrorProd(error, res);
  }
};
