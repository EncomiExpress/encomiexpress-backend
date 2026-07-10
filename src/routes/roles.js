const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const rolController = require('../controllers/rolController');
const { authenticate, authorize, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation } = require('../validators/rolesValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Gestión de roles y permisos (solo administradores)
 */

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: Listar roles
 *     tags: [Roles]
 *     parameters:
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de roles con sus permisos asignados
 */
router.get('/', authorize('admin'), rolController.getAll);

/**
 * @swagger
 * /roles/permisos:
 *   get:
 *     summary: Listar todos los permisos disponibles del sistema
 *     tags: [Roles]
 *     responses:
 *       200:
 *         description: Lista completa de permisos
 */
router.get('/permisos', rolController.getAllPermisos);

/**
 * @swagger
 * /roles/{id}:
 *   get:
 *     summary: Obtener rol por ID
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del rol con permisos
 *       404:
 *         description: Rol no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authorize('admin'), rolController.getById);

/**
 * @swagger
 * /roles:
 *   post:
 *     summary: Crear nuevo rol
 *     tags: [Roles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RolCreate'
 *     responses:
 *       201:
 *         description: Rol creado con permisos asignados
 *       400:
 *         description: Ya existe un rol con ese nombre
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorize('admin'), createValidation, validate, rolController.create);

/**
 * @swagger
 * /roles/{id}:
 *   put:
 *     summary: Actualizar rol y sus permisos
 *     tags: [Roles]
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
 *             $ref: '#/components/schemas/RolCreate'
 *     responses:
 *       200:
 *         description: Rol actualizado
 *       404:
 *         description: Rol no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', authorize('admin'), updateValidation, validate, rolController.update);

/**
 * @swagger
 * /roles/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar rol
 *     description: |
 *       Al inhabilitar: deshabilita el rol Y todos los usuarios con ese rol, excepto el admin activo.
 *       Al habilitar: re-habilita el rol Y todos los usuarios con ese rol.
 *       No se puede inhabilitar el propio rol del usuario autenticado.
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado. Usuarios del rol afectados en cascada.
 *       400:
 *         description: No se puede inhabilitar el propio rol
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_rol'), rolController.toggleHabilitado);

module.exports = router;
