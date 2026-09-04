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
 *   description: Valores de configuración globales del sistema (tarifas por kg hierro/normal y tarifa por paquete de Ventas)
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
 *                     tarifaPorKgHierro: { type: number }
 *                     tarifaPorKgNormal: { type: number }
 *                     tarifaPorPaquete: { type: number }
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
 *               tarifaPorKgHierro: { type: number, example: 450 }
 *               tarifaPorKgNormal: { type: number, example: 650 }
 *               tarifaPorPaquete: { type: number, example: 10000 }
 *     responses:
 *       200:
 *         description: Configuración actualizada
 */
router.put('/', authorize('admin'), updateValidation, validate, configuracionController.update);

module.exports = router;
