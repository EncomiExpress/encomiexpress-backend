const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const encomiendaVentaController = require('../controllers/encomiendaVentaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const {
  createValidation,
  updateValidation,
} = require('../validators/encomiendasValidator');

/**
 * @swagger
 * tags:
 *   name: Encomiendas
 *   description: Gestión de encomiendas y ventas de servicio
 */

router.use(authenticate);

router.get('/:id/page-of', authorizePermission('listar_venta'), encomiendaVentaController.getPageOf);

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
router.get('/rango-fechas', authorizePermission('ver_dashboard'), encomiendaVentaController.getRangoFechas);

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
router.get('/', authorizePermission('listar_venta'), encomiendaVentaController.getAll);

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
/**
 * Paquetes marcados como devueltos por el conductor (para la sección "Paquetes
 * devueltos" del panel admin). Deben quedar declaradas antes de "/:id" para que
 * Express no intente matchear "paquetes" como parámetro de esa ruta.
 */
router.get('/paquetes/devueltos', authorizePermission('listar_venta'), encomiendaVentaController.getPaquetesDevueltos);
router.get('/paquetes/devueltos/anios-disponibles', authorizePermission('listar_venta'), encomiendaVentaController.getAniosDisponiblesPaquetesDevueltos);
router.get('/:id', authorizePermission('consultar_venta'), encomiendaVentaController.getById);

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
router.post('/', authorizePermission('registrar_venta'), createValidation, validate, encomiendaVentaController.create);

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
router.put('/:id', authorizePermission('actualizar_venta'), updateValidation, validate, encomiendaVentaController.update);

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
 * /encomiendas/{id}/reactivar:
 *   patch:
 *     summary: Reactiva una venta "Cancelada" a "Programada" sin editar ningún dato — solo para cuando la ruta ya volvió a servir sola
 *     tags: [Encomiendas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Venta reactivada
 */
router.patch('/:id/reactivar', authorizePermission('actualizar_venta'), encomiendaVentaController.reactivar);

module.exports = router;
