const express = require('express');
const router = express.Router();
const conductorController = require('../controllers/conductorController');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { createValidation, updateValidation, cambiarEstadoValidation } = require('../validators/conductoresValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Conductores
 *   description: Gestión de conductores y operaciones de su perfil propio
 */

/**
 * @swagger
 * /conductores/perfil:
 *   get:
 *     summary: Obtener perfil del conductor autenticado (solo conductores)
 *     tags: [Conductores]
 *     responses:
 *       200:
 *         description: Perfil del conductor con datos de licencia y vehículo asignado
 *       403:
 *         description: Solo conductores pueden acceder a este endpoint
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/perfil', conductorController.getPerfil);

/**
 * @swagger
 * /conductores/perfil:
 *   put:
 *     summary: Actualizar perfil del conductor autenticado (solo conductores)
 *     tags: [Conductores]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:              { type: string }
 *               apellido:            { type: string }
 *               telefono:            { type: string }
 *               email:               { type: string, format: email }
 *               numeroIdentificacion: { type: string }
 *               direccion:           { type: string }
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 */
router.put('/perfil', conductorController.actualizarPerfil);

/**
 * @swagger
 * /conductores/mis-anticipos:
 *   get:
 *     summary: Listar anticipos del conductor autenticado (solo conductores)
 *     tags: [Conductores]
 *     responses:
 *       200:
 *         description: Anticipos del conductor
 *       403:
 *         description: Solo conductores pueden acceder
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/mis-anticipos', conductorController.getMisAnticipos);

/**
 * @swagger
 * /conductores:
 *   get:
 *     summary: Listar conductores
 *     tags: [Conductores]
 *     parameters:
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de conductores con datos de usuario y licencia
 */
router.get('/', conductorController.getAll);
router.get('/:id/page-of', authorize('admin'), conductorController.getPageOf);

/**
 * @swagger
 * /conductores/{id}:
 *   get:
 *     summary: Obtener conductor por ID
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del conductor
 *       404:
 *         description: Conductor no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', conductorController.getById);

/**
 * @swagger
 * /conductores/{id}/anticipos:
 *   get:
 *     summary: Listar anticipos de un conductor específico
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de anticipos y excedentes del conductor
 */
router.get('/:id/anticipos', conductorController.getAnticipos);

/**
 * @swagger
 * /conductores:
 *   post:
 *     summary: Registrar nuevo conductor (solo admin)
 *     tags: [Conductores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConductorCreate'
 *     responses:
 *       201:
 *         description: Conductor registrado con usuario vinculado (rol conductor asignado automáticamente)
 *       400:
 *         description: Email o documento ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorize('admin'), createValidation, validate, conductorController.create);

/**
 * @swagger
 * /conductores/{id}:
 *   put:
 *     summary: Actualizar conductor (solo admin)
 *     tags: [Conductores]
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
 *             $ref: '#/components/schemas/ConductorCreate'
 *     responses:
 *       200:
 *         description: Conductor actualizado
 */
router.put('/:id', authorize('admin'), updateValidation, validate, conductorController.update);

/**
 * @swagger
 * /conductores/{id}/estado:
 *   patch:
 *     summary: Cambiar estado operativo del conductor (solo admin)
 *     tags: [Conductores]
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
 *                 enum: [Disponible, En Ruta]
 *     responses:
 *       200:
 *         description: Estado operativo actualizado
 */
router.patch('/:id/estado', authorize('admin'), cambiarEstadoValidation, validate, conductorController.cambiarEstado);

/**
 * @swagger
 * /conductores/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar conductor (solo admin)
 *     description: |
 *       Afecta únicamente el acceso al sistema (`usuario.habilitado`).
 *       Los registros de rutas, anticipos y vehículos permanecen intactos.
 *     tags: [Conductores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 *       400:
 *         description: Conductor tiene rutas activas o anticipos pendientes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_conductor'), conductorController.toggleHabilitado);

module.exports = router;
