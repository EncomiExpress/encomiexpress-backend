const { Router } = require('express');
const { validate } = require('../middlewares/validation');
const { listarClientes, obtenerCliente, registrarCliente, actualizarCliente, toggleHabilitadoCliente } = require('../controllers/clienteController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation } = require('../validators/clientesValidator');
const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Clientes
 *   description: Gestión de clientes remitentes de encomiendas
 */

/**
 * @swagger
 * /clientes:
 *   get:
 *     summary: Listar clientes
 *     tags: [Clientes]
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
 *         name: q
 *         description: Búsqueda por nombre, apellido, email o documento
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista paginada de clientes
 */
router.get('/', authorizePermission('listar_cliente'), listarClientes);

/**
 * @swagger
 * /clientes/{id}:
 *   get:
 *     summary: Obtener cliente por ID
 *     tags: [Clientes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del cliente
 *       404:
 *         description: Cliente no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authorizePermission('consultar_cliente'), obtenerCliente);

/**
 * @swagger
 * /clientes:
 *   post:
 *     summary: Registrar nuevo cliente
 *     tags: [Clientes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClienteCreate'
 *     responses:
 *       201:
 *         description: Cliente registrado exitosamente
 *       400:
 *         description: Email o documento ya registrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorizePermission('registrar_cliente'), createValidation, validate, registrarCliente);

/**
 * @swagger
 * /clientes/{id}:
 *   put:
 *     summary: Actualizar cliente
 *     tags: [Clientes]
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
 *             $ref: '#/components/schemas/ClienteCreate'
 *     responses:
 *       200:
 *         description: Cliente actualizado
 *       404:
 *         description: Cliente no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', authorizePermission('actualizar_cliente'), updateValidation, validate, actualizarCliente);

/**
 * @swagger
 * /clientes/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar cliente
 *     tags: [Clientes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 *       400:
 *         description: Cliente tiene encomiendas activas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_cliente'), toggleHabilitadoCliente);

module.exports = router;
