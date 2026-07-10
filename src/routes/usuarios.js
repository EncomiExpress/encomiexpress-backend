const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const usuarioController = require('../controllers/usuarioController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation, changePasswordValidation } = require('../validators/usuariosValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Gestión de usuarios del sistema
 */

/**
 * @swagger
 * /usuarios:
 *   get:
 *     summary: Listar usuarios
 *     tags: [Usuarios]
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
 *         name: idRol
 *         schema: { type: integer }
 *       - in: query
 *         name: q
 *         description: Búsqueda por nombre, apellido, email o documento
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         description: "Campo y dirección: nombre.asc | apellido.desc"
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista paginada de usuarios
 */
router.get('/', authorizePermission('listar_usuario'), usuarioController.getAll);

/**
 * @swagger
 * /usuarios/{id}:
 *   get:
 *     summary: Obtener usuario por ID
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del usuario
 *       404:
 *         description: Usuario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authorizePermission('consultar_usuario'), usuarioController.getById);

/**
 * @swagger
 * /usuarios:
 *   post:
 *     summary: Registrar nuevo usuario (solo roles distintos a conductor)
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UsuarioCreate'
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *       400:
 *         description: Email o documento ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorizePermission('registrar_usuario'), createValidation, validate, usuarioController.create);

/**
 * @swagger
 * /usuarios/{id}:
 *   put:
 *     summary: Actualizar usuario
 *     tags: [Usuarios]
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
 *             $ref: '#/components/schemas/UsuarioCreate'
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       404:
 *         description: Usuario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', authorizePermission('actualizar_usuario'), updateValidation, validate, usuarioController.update);

/**
 * @swagger
 * /usuarios/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar usuario
 *     description: |
 *       No se puede inhabilitar la propia cuenta activa.
 *       No se puede inhabilitar al último administrador activo del sistema.
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 *       400:
 *         description: Acción no permitida (propia cuenta o último admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_usuario'), usuarioController.toggleHabilitado);

/**
 * @swagger
 * /usuarios/{id}/ignorar-registro:
 *   patch:
 *     summary: Ignorar una solicitud de autoregistro pendiente
 *     description: |
 *       Para cuentas creadas por autoregistro público (POST /auth/register) que un
 *       admin decide no aprobar. Quita la marca de "pendiente de activación" sin
 *       habilitar la cuenta — queda inhabilitada igual que cualquier otra.
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Solicitud ignorada correctamente
 *       400:
 *         description: El usuario no tiene un registro pendiente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/ignorar-registro', authorizePermission('inhabilitar_usuario'), usuarioController.ignorarRegistro);

/**
 * @swagger
 * /usuarios/{id}/change-password:
 *   post:
 *     summary: Cambiar contraseña de un usuario específico
 *     tags: [Usuarios]
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
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string }
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 *       400:
 *         description: Contraseña actual incorrecta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/change-password', authorizePermission('actualizar_usuario'), changePasswordValidation, validate, usuarioController.changePassword);

module.exports = router;
