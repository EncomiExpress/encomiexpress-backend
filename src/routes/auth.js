const express = require('express');
const router = express.Router();
const { login, register, getProfile, getConductorProfile, refreshToken, recoverPassword } = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { loginValidation, registerValidation, recoverPasswordValidation } = require('../validators/authValidator');
const { authLimiter } = require('../middlewares/rateLimiter');

// Rutas públicas — con rate limiting estricto contra fuerza bruta
router.post('/login', authLimiter, loginValidation, validate, authController.login);
router.post('/register', authLimiter, registerValidation, validate, authController.register);
router.post('/recuperar-password', authLimiter, recoverPasswordValidation, validate, authController.recoverPassword);
// Rutas públicas
router.post('/login', loginLimiter, loginValidation, validate, login);
router.post('/register', authLimiter, registerValidation, validate, register);
router.post('/recover-password', authLimiter, recoverPasswordValidation, validate, recoverPassword);

// Ruta para refresh token
router.post('/refresh', refreshToken);

// Rutas protegidas
router.get('/profile', authenticate, getProfile);

// Nueva ruta para obtener datos del conductor desde el token
router.get('/conductor-profile', authenticate, getConductorProfile);

module.exports = router;