const express = require('express');
const router = express.Router();
const { validate } = require('../middlewares/validation');
const salidaController = require('../controllers/salidaProgramadaController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { createValidation, updateValidation } = require('../validators/salidasValidator');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Salidas
 *   description: Agenda concreta de viajes (fecha/hora/estado/convoy/paradas) sobre
 *     una plantilla de /rutas.
 */

router.get('/', authorizePermission('listar_ruta'), salidaController.getAll);

router.get('/anios-disponibles', authorizePermission('listar_ruta'), salidaController.getAniosDisponibles);

/**
 * @swagger
 * /salidas/disponibilidad:
 *   get:
 *     summary: Salidas activas que ya tienen asignado alguno de los vehículos/conductores dados
 *     description: |
 *       Usado por el calendario de Registrar/Actualizar Ruta para pintar los días
 *       ocupados (ventana de enfriamiento) antes de intentar guardar.
 *     tags: [Salidas]
 *     parameters:
 *       - in: query
 *         name: idVehiculos
 *         schema: { type: string }
 *         description: IDs separados por coma
 *       - in: query
 *         name: idConductores
 *         schema: { type: string }
 *         description: IDs separados por coma
 *       - in: query
 *         name: idSalidaExcluir
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lista de salidas/pares ocupados
 */
router.get('/disponibilidad', authorizePermission('listar_ruta'), salidaController.getDisponibilidad);

router.get('/:id/page-of', authorizePermission('listar_ruta'), salidaController.getPageOf);

/**
 * @swagger
 * /salidas/{id}:
 *   get:
 *     summary: Obtener una salida programada por ID
 *     tags: [Salidas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Datos de la salida, con su plantilla, convoy y paradas
 *       404:
 *         description: Ruta no encontrada
 */
router.get('/:id', authorizePermission('consultar_ruta'), salidaController.getById);

/**
 * @swagger
 * /salidas:
 *   post:
 *     summary: Programar una nueva salida sobre una plantilla de ruta
 *     tags: [Salidas]
 *     responses:
 *       201:
 *         description: Salida programada exitosamente
 */
router.post('/', authorizePermission('registrar_ruta'), createValidation, validate, salidaController.create);

/**
 * @swagger
 * /salidas/{id}:
 *   put:
 *     summary: Actualizar una salida programada
 *     tags: [Salidas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Salida actualizada
 */
// Autorización dual (admin vs. operador_sede) resuelta dentro del controller, mismo
// motivo que /:id/estado — operador_sede solo edita fecha/hora de su propio regreso.
router.put('/:id', updateValidation, validate, salidaController.update);

/**
 * @swagger
 * /salidas/{id}/estado:
 *   patch:
 *     summary: Cambiar estado de la salida
 *     tags: [Salidas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado actualizado
 */
// Autorización dual (admin vs. operador_sede) resuelta dentro del controller.
router.patch('/:id/estado', salidaController.updateEstado);

/**
 * @swagger
 * /salidas/{idSalidaIda}/regreso-sede:
 *   post:
 *     summary: Programa el regreso de una sede remota (operador_sede) — solo fecha/hora de salida
 *     tags: [Salidas]
 *     parameters:
 *       - in: path
 *         name: idSalidaIda
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Salida de regreso creada
 */
router.post('/:idSalidaIda/regreso-sede', authorizePermission('programar_regreso_sede'), salidaController.crearRegresoDesdeSede);

/**
 * @swagger
 * /salidas/{id}/toggle-habilitado:
 *   patch:
 *     summary: Habilitar o inhabilitar una salida
 *     tags: [Salidas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Estado cambiado correctamente
 */
// Autorización dual (admin vs. operador_sede) resuelta dentro del controller —
// operador_sede solo inhabilita/habilita su propio regreso.
router.patch('/:id/toggle-habilitado', salidaController.toggleHabilitado);

module.exports = router;
