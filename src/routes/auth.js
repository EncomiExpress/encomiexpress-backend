const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { loginValidation, registerValidation, recoverPasswordValidation } = require('../validators/authValidator');
const { authLimiter } = require('../middlewares/rateLimiter');

// Rutas públicas
router.post('/login', authLimiter, loginValidation, validate, authController.login);
router.post('/register', authLimiter, registerValidation, validate, authController.register);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/recuperar-password', authLimiter, recoverPasswordValidation, validate, authController.recuperarPassword);

// Rutas protegidas
router.post('/cambiar-password', authenticate, authLimiter, authController.cambiarPassword);
router.get('/profile', authenticate, authController.getProfile);
router.get('/conductor-profile', authenticate, authController.getConductorProfile);

module.exports = router;