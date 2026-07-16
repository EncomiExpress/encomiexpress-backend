const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const propietarioController = require('../controllers/propietarioVehiculoController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation } = require('../validators/propietariosValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Propietarios
 *   description: Gestión de propietarios de vehículos
 */

/**
 * @swagger
 * /propietarios:
 *   get:
 *     summary: Listar propietarios de vehículos
 *     tags: [Propietarios]
 *     parameters:
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de propietarios
 */
router.get('/', authorizePermission('listar_propietario'), propietarioController.getAll);
router.get('/:id/page-of', authorizePermission('listar_propietario'), propietarioController.getPageOf);

/**
 * @swagger
 * /propietarios/{id}:
 *   get:
 *     summary: Obtener propietario por ID
 *     tags: [Propietarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del propietario
 *       404:
 *         description: Propietario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authorizePermission('consultar_propietario'), propietarioController.getById);

/**
 * @swagger
 * /propietarios:
 *   post:
 *     summary: Registrar nuevo propietario
 *     tags: [Propietarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PropietarioCreate'
 *     responses:
 *       201:
 *         description: Propietario registrado
 *       400:
 *         description: Documento ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorizePermission('registrar_propietario'), createValidation, validate, propietarioController.create);

/**
 * @swagger
 * /propietarios/{id}:
 *   put:
 *     summary: Actualizar propietario
 *     tags: [Propietarios]
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
 *             $ref: '#/components/schemas/PropietarioCreate'
 *     responses:
 *       200:
 *         description: Propietario actualizado
 */
router.put('/:id', authorizePermission('actualizar_propietario'), updateValidation, validate, propietarioController.update);

/**
 * @swagger
 * /propietarios/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar propietario
 *     tags: [Propietarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_propietario'), propietarioController.toggleHabilitado);

module.exports = router;
