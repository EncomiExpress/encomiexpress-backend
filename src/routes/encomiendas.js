const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const encomiendaVentaController = require('../controllers/encomiendaVentaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const {
  createValidation,
  updateValidation,
  cambiarEstadoValidation,
  cambiarEstadoPagoValidation,
} = require('../validators/encomiendasValidator');

/**
 * @swagger
 * tags:
 *   name: Encomiendas
 *   description: Gestión de encomiendas y ventas de servicio
 */

router.use(authenticate);

router.get('/:id/page-of', encomiendaVentaController.getPageOf);

/**
 * @swagger
 * /encomiendas/rango-fechas:
 *   get:
 *     summary: Fecha de registro de la primera y la última venta (para el filtro de período del Dashboard)
 *     tags: [Encomiendas]
 *     responses:
 *       200:
 *         description: "{ primerRegistro, ultimoRegistro } en formato YYYY-MM-DD, o null si no hay ventas"
 */
router.get('/rango-fechas', encomiendaVentaController.getRangoFechas);

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
router.patch('/paquetes/:idPaquete/estado', encomiendaVentaController.actualizarEstadoPaquete);
router.patch('/paquetes/estado-masivo', encomiendaVentaController.actualizarVariosPaquetes);

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
router.put('/:id', updateValidation, validate, encomiendaVentaController.update);

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
 * /encomiendas/{id}/estado-pago:
 *   patch:
 *     summary: Confirmar/cambiar el estado de pago de la encomienda (independiente del estado de envío)
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
 *             required: [estadoPago]
 *             properties:
 *               estadoPago:
 *                 type: string
 *                 enum: [Pendiente, Pagado]
 *     responses:
 *       200:
 *         description: Estado de pago actualizado
 */
router.patch('/:id/estado-pago', cambiarEstadoPagoValidation, validate, encomiendaVentaController.cambiarEstadoPago);

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

module.exports = router;
