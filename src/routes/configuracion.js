const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const configuracionController = require('../controllers/configuracionController');
const { authenticate, authorize } = require('../middlewares/auth');
const { updateValidation } = require('../validators/configuracionValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Configuración
 *   description: Valores de configuración globales del sistema (ej. tarifa por kg de Ventas)
 */

/**
 * @swagger
 * /configuracion:
 *   get:
 *     summary: Obtener la configuración actual
 *     tags: [Configuración]
 *     responses:
 *       200:
 *         description: Configuración actual
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tarifaPorKg: { type: number }
 */
router.get('/', configuracionController.get);

/**
 * @swagger
 * /configuracion:
 *   put:
 *     summary: Actualizar la configuración (solo admin)
 *     tags: [Configuración]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tarifaPorKg: { type: number, example: 1500 }
 *     responses:
 *       200:
 *         description: Configuración actualizada
 */
router.put('/', authorize('admin'), updateValidation, validate, configuracionController.update);

module.exports = router;
