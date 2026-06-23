const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const anticipoController = require('../controllers/anticipoExcedenteController');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth');
const { upload } = require('../config/cloudinary');
const { createValidation } = require('../validators/anticiposValidator');

/**
 * @swagger
 * tags:
 *   name: Anticipos
 *   description: Gestión de anticipos y excedentes de conductores
 */

/**
 * @swagger
 * /anticipos:
 *   get:
 *     summary: Listar anticipos y excedentes
 *     tags: [Anticipos]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: idConductor
 *         schema: { type: integer }
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [anticipo, excedente] }
 *       - in: query
 *         name: estado
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista paginada de anticipos
 */
router.get('/', authenticate, authorizePermission('listar_anticipo'), anticipoController.getAll);

/**
 * @swagger
 * /anticipos/{id}:
 *   get:
 *     summary: Obtener anticipo por ID
 *     tags: [Anticipos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del anticipo con soporte adjunto
 *       404:
 *         description: Anticipo no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authenticate, authorizePermission('consultar_anticipo'), anticipoController.getById);

/**
 * @swagger
 * /anticipos:
 *   post:
 *     summary: Registrar anticipo o excedente
 *     tags: [Anticipos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnticipoCreate'
 *     responses:
 *       201:
 *         description: Anticipo registrado exitosamente
 */
router.post('/', authenticate, authorize('admin', 'conductor'), createValidation, validate, anticipoController.create);

/**
 * @swagger
 * /anticipos/{id}:
 *   put:
 *     summary: Actualizar anticipo
 *     tags: [Anticipos]
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
 *             $ref: '#/components/schemas/AnticipoCreate'
 *     responses:
 *       200:
 *         description: Anticipo actualizado
 */
router.put('/:id', authenticate, authorize('admin', 'conductor'), anticipoController.update);

/**
 * @swagger
 * /anticipos/{id}/soporte:
 *   post:
 *     summary: Subir comprobante/soporte del anticipo a Cloudinary
 *     tags: [Anticipos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               soporte:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Soporte subido y URL guardada
 */
router.post('/:id/soporte', authenticate, authorize('admin', 'conductor'),
  upload.single('soporte'),
  anticipoController.updateSoporte
);

/**
 * @swagger
 * /anticipos/{id}/estado:
 *   patch:
 *     summary: Cambiar estado del anticipo
 *     tags: [Anticipos]
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
 *                 enum: [pendiente, aprobado, rechazado]
 *     responses:
 *       200:
 *         description: Estado actualizado
 */
router.patch('/:id/estado', authenticate, authorize('admin', 'conductor'), authorizePermission('actualizar_anticipo'), anticipoController.cambiarEstado);

/**
 * @swagger
 * /anticipos/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar anticipo (solo admin)
 *     tags: [Anticipos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authenticate, authorize('admin'), authorizePermission('actualizar_anticipo'), anticipoController.toggleHabilitado);

module.exports = router;
