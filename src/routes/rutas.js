const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const rutaController = require('../controllers/rutaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation } = require('../validators/rutasValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Rutas
 *   description: Programación de rutas de transporte
 */

/**
 * @swagger
 * /rutas:
 *   get:
 *     summary: Listar rutas programadas
 *     tags: [Rutas]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [activo, inactivo] }
 *     responses:
 *       200:
 *         description: Lista paginada de rutas
 */
router.get('/', authorizePermission('listar_ruta'), rutaController.getAll);

/**
 * @swagger
 * /rutas/available:
 *   get:
 *     summary: Listar rutas disponibles (sin encomiendas activas asignadas)
 *     tags: [Rutas]
 *     responses:
 *       200:
 *         description: Lista de rutas disponibles para asignar encomiendas
 */
router.get('/available', authorizePermission('listar_ruta'), rutaController.getAvailable);

/**
 * @swagger
 * /rutas/{id}:
 *   get:
 *     summary: Obtener ruta por ID
 *     tags: [Rutas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos de la ruta con conductor, vehículo y destino
 *       404:
 *         description: Ruta no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/page-of', authorizePermission('listar_ruta'), rutaController.getPageOf);
router.get('/:id', authorizePermission('consultar_ruta'), rutaController.getById);

/**
 * @swagger
 * /rutas:
 *   post:
 *     summary: Programar nueva ruta
 *     tags: [Rutas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RutaCreate'
 *     responses:
 *       201:
 *         description: Ruta programada exitosamente
 *       400:
 *         description: Conductor o vehículo no disponible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorizePermission('registrar_ruta'), createValidation, validate, rutaController.create);

/**
 * @swagger
 * /rutas/{id}:
 *   put:
 *     summary: Actualizar ruta
 *     tags: [Rutas]
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
 *             $ref: '#/components/schemas/RutaCreate'
 *     responses:
 *       200:
 *         description: Ruta actualizada
 */
router.put('/:id', authorizePermission('actualizar_ruta'), rutaController.update);

/**
 * @swagger
 * /rutas/{id}/estado:
 *   patch:
 *     summary: Cambiar estado de la ruta
 *     tags: [Rutas]
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
 *             type: object
 *             required: [estado]
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [activo, inactivo]
 *     responses:
 *       200:
 *         description: Estado actualizado
 */
router.patch('/:id/estado', authorizePermission('actualizar_ruta'), rutaController.updateEstado);

/**
 * @swagger
 * /rutas/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar ruta
 *     tags: [Rutas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_ruta'), rutaController.toggleHabilitado);

module.exports = router;
