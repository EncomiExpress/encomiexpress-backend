const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { loginValidation, recoverPasswordValidation, cambiarPasswordValidation, resetPasswordValidation } = require('../validators/authValidator');
const { authLimiter, loginLimiter } = require('../middlewares/rateLimiter');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Autenticación y gestión de sesión
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login exitoso — devuelve token, refreshToken y datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciales incorrectas o cuenta/rol inhabilitado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', loginLimiter, loginValidation, validate, authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renovar access token usando refresh token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Nuevo access token generado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       401:
 *         description: Refresh token inválido, expirado o rol/cuenta inhabilitado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/refresh', authLimiter, authController.refresh);

/**
 * @swagger
 * /auth/recuperar-password:
 *   post:
 *     summary: Enviar enlace de reseteo de contraseña al correo
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: >
 *           Mismo mensaje exista o no el correo (evita revelar qué correos están
 *           registrados). Si existe, se manda un enlace de reseteo por email (vence
 *           en 30 min, un solo uso) — requiere la API de Brevo configurada
 *           (BREVO_API_KEY/EMAIL_USER) y FRONTEND_URLS para armar el enlace.
 */
router.post('/recuperar-password', authLimiter, recoverPasswordValidation, validate, authController.recuperarPassword);

/**
 * @swagger
 * /auth/resetear-password:
 *   post:
 *     summary: Elegir nueva contraseña con el token del enlace de recuperar-password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, passwordNueva]
 *             properties:
 *               token:
 *                 type: string
 *               passwordNueva:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente
 *       400:
 *         description: Token inválido, vencido, o ya usado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/resetear-password', authLimiter, resetPasswordValidation, validate, authController.resetearPassword);

/**
 * @swagger
 * /auth/cambiar-password:
 *   post:
 *     summary: Cambiar contraseña del usuario autenticado
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [passwordActual, passwordNueva]
 *             properties:
 *               passwordActual:
 *                 type: string
 *               passwordNueva:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente
 *       400:
 *         description: Contraseña actual incorrecta o nueva igual a la actual
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/cambiar-password', authenticate, authLimiter, cambiarPasswordValidation, validate, authController.cambiarPassword);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Obtener perfil del usuario autenticado
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Datos del usuario actual (sin contraseña)
 *       401:
 *         description: Token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/profile', authenticate, authController.getProfile);

/**
 * @swagger
 * /auth/conductor-profile:
 *   get:
 *     summary: Obtener perfil completo del conductor autenticado
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Datos del conductor incluyendo licencia y estado
 *       403:
 *         description: Solo conductores pueden acceder a este endpoint
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/conductor-profile', authenticate, authController.getConductorProfile);

module.exports = router;
