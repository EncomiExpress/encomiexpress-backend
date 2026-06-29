const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const encomiendaVentaController = require('../controllers/encomiendaVentaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const {
  createValidation,
  cambiarEstadoValidation,
  agregarPaqueteValidation,
  agregarDestinatarioValidation
} = require('../validators/encomiendasValidator');

/**
 * @swagger
 * tags:
 *   name: Encomiendas
 *   description: Gestión de encomiendas y ventas de servicio
 */

/**
 * @swagger
 * /encomiendas/public/{token}:
 *   get:
 *     summary: Seguimiento público de encomienda por token (sin autenticación)
 *     tags: [Encomiendas]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         description: Token de seguimiento entregado al cliente
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Estado y datos básicos de la encomienda
 *       404:
 *         description: Encomienda no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/public/:token', encomiendaVentaController.getPublicByToken);

router.use(authenticate);

router.get('/:id/page-of', encomiendaVentaController.getPageOf);

/**
 * @swagger
 * /encomiendas:
 *   get:
 *     summary: Listar encomiendas
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [pendiente, en_ruta, entregado, devuelto, cancelado] }
 *       - in: query
 *         name: estadoPago
 *         schema: { type: string, enum: [pendiente, pagado] }
 *       - in: query
 *         name: q
 *         description: Búsqueda por número de guía o nombre de cliente
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista paginada de encomiendas
 */
router.get('/', encomiendaVentaController.getAll);

/**
 * @swagger
 * /encomiendas/guia/{numeroGuia}:
 *   get:
 *     summary: Buscar encomienda por número de guía
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: path
 *         name: numeroGuia
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Encomienda encontrada
 *       404:
 *         description: Guía no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/guia/:numeroGuia', encomiendaVentaController.getByGuia);

/**
 * @swagger
 * /encomiendas/{id}:
 *   get:
 *     summary: Obtener encomienda por ID
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos completos de la encomienda con paquetes y destinatario
 *       404:
 *         description: Encomienda no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', encomiendaVentaController.getById);

/**
 * @swagger
 * /encomiendas:
 *   post:
 *     summary: Registrar nueva encomienda/venta
 *     tags: [Encomiendas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EncomiendaCreate'
 *     responses:
 *       201:
 *         description: Encomienda registrada con número de guía generado
 */
router.post('/', createValidation, validate, encomiendaVentaController.create);

/**
 * @swagger
 * /encomiendas/{id}:
 *   put:
 *     summary: Actualizar encomienda
 *     tags: [Encomiendas]
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
 *             $ref: '#/components/schemas/EncomiendaCreate'
 *     responses:
 *       200:
 *         description: Encomienda actualizada
 */
router.put('/:id', encomiendaVentaController.update);

/**
 * @swagger
 * /encomiendas/{id}/estado:
 *   patch:
 *     summary: Cambiar estado de la encomienda
 *     tags: [Encomiendas]
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
 *                 enum: [pendiente, en_ruta, entregado, devuelto, cancelado]
 *     responses:
 *       200:
 *         description: Estado actualizado
 */
router.patch('/:id/estado', cambiarEstadoValidation, validate, encomiendaVentaController.cambiarEstado);

/**
 * @swagger
 * /encomiendas/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar encomienda
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authorizePermission('inhabilitar_venta'), encomiendaVentaController.toggleHabilitado);

/**
 * @swagger
 * /encomiendas/{idEncomiendaVenta}/paquetes:
 *   post:
 *     summary: Agregar paquete a una encomienda existente
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: path
 *         name: idEncomiendaVenta
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [descripcion, peso]
 *             properties:
 *               descripcion: { type: string }
 *               peso:        { type: number, example: 2.5 }
 *               valorDeclarado: { type: number }
 *     responses:
 *       201:
 *         description: Paquete agregado
 */
router.post('/:idEncomiendaVenta/paquetes', agregarPaqueteValidation, validate, encomiendaVentaController.agregarPaquete);

/**
 * @swagger
 * /encomiendas/{idEncomiendaVenta}/destinatario:
 *   post:
 *     summary: Agregar destinatario a una encomienda
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: path
 *         name: idEncomiendaVenta
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, telefono]
 *             properties:
 *               nombre:    { type: string }
 *               telefono:  { type: string }
 *               direccion: { type: string }
 *     responses:
 *       201:
 *         description: Destinatario registrado
 */
router.post('/:idEncomiendaVenta/destinatario', agregarDestinatarioValidation, validate, encomiendaVentaController.agregarDestinatario);

module.exports = router;
