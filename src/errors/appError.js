class AppError extends Error {
  constructor(message, statusCode, details, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
