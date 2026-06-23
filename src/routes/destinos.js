const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const destinoController = require('../controllers/destinoController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation } = require('../validators/destinosValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Destinos
 *   description: Ciudades de destino de las rutas (Bajo Cauca y conexiones)
 */

/**
 * @swagger
 * /destinos:
 *   get:
 *     summary: Listar destinos
 *     tags: [Destinos]
 *     parameters:
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de destinos
 */
router.get('/', authorizePermission('listar_destino'), destinoController.getAll);

/**
 * @swagger
 * /destinos/{id}:
 *   get:
 *     summary: Obtener destino por ID
 *     tags: [Destinos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del destino
 *       404:
 *         description: Destino no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authorizePermission('consultar_destino'), destinoController.getById);

/**
 * @swagger
 * /destinos:
 *   post:
 *     summary: Registrar nuevo destino
 *     tags: [Destinos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DestinoCreate'
 *     responses:
 *       201:
 *         description: Destino registrado
 *       400:
 *         description: Destino ya existe (misma ciudad y departamento)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorizePermission('registrar_destino'), createValidation, validate, destinoController.create);

/**
 * @swagger
 * /destinos/{id}:
 *   put:
 *     summary: Actualizar destino
 *     tags: [Destinos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DestinoCreate'
 *     responses:
 *       200:
 *         description: Destino actualizado
 */
router.put('/:id', authorizePermission('actualizar_destino'), destinoController.update);

/**
 * @swagger
 * /destinos/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar destino
 *     tags: [Destinos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authorizePermission('actualizar_destino'), destinoController.toggleHabilitado);

module.exports = router;
