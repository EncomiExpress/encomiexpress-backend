const { validationResult } = require('express-validator');
const AppError = require('../errors/appError');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return next(new AppError('Errores de validación', 400, errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }))));
  }
  
  next();
};

module.exports = { validate };