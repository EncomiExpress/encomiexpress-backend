const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const vehiculoController = require('../controllers/vehiculoController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, cambiarEstadoValidation } = require('../validators/vehiculosValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Vehículos
 *   description: Gestión de vehículos de carga
 */

/**
 * @swagger
 * /vehiculos:
 *   get:
 *     summary: Listar vehículos
 *     tags: [Vehículos]
 *     parameters:
 *       - in: query
 *         name: habilitado
 *         schema: { type: string, enum: ['true','false'] }
 *       - in: query
 *         name: idConductor
 *         schema: { type: integer }
 *       - in: query
 *         name: q
 *         description: Búsqueda por placa, marca o modelo
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de vehículos
 */
router.get('/', authorizePermission('listar_vehiculo'), vehiculoController.getAll);

/**
 * @swagger
 * /vehiculos/{id}:
 *   get:
 *     summary: Obtener vehículo por ID
 *     tags: [Vehículos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos del vehículo
 *       404:
 *         description: Vehículo no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', authorizePermission('consultar_vehiculo'), vehiculoController.getById);

/**
 * @swagger
 * /vehiculos:
 *   post:
 *     summary: Registrar nuevo vehículo
 *     tags: [Vehículos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehiculoCreate'
 *     responses:
 *       201:
 *         description: Vehículo registrado
 *       400:
 *         description: Placa ya registrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authorizePermission('registrar_vehiculo'), createValidation, validate, vehiculoController.create);

/**
 * @swagger
 * /vehiculos/{id}:
 *   put:
 *     summary: Actualizar vehículo
 *     tags: [Vehículos]
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
 *             $ref: '#/components/schemas/VehiculoCreate'
 *     responses:
 *       200:
 *         description: Vehículo actualizado
 */
router.put('/:id', authorizePermission('actualizar_vehiculo'), vehiculoController.update);

/**
 * @swagger
 * /vehiculos/{id}/estado:
 *   patch:
 *     summary: Cambiar estado operativo del vehículo
 *     tags: [Vehículos]
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
 *                 enum: [disponible, en_ruta, mantenimiento]
 *     responses:
 *       200:
 *         description: Estado actualizado
 */
router.patch('/:id/estado', cambiarEstadoValidation, validate, vehiculoController.cambiarEstado);

/**
 * @swagger
 * /vehiculos/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar vehículo
 *     tags: [Vehículos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
router.patch('/:id/toggle-habilitado', authorizePermission('actualizar_vehiculo'), vehiculoController.toggleHabilitado);

module.exports = router;
